import { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Trees, EyeOff, Ban, Search, Loader2, LayoutDashboard, Users, KeyRound, LogOut, CheckCircle2 } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api, errMsg } from './api.js';
import { generateEligibilityProof } from './zk.js';

const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const Nav = () => (
  <nav className="nav"><b><ShieldCheck size={20} /> Silent Voice</b>
    <Link to="/submit">Submit complaint</Link><Link to="/track">Track</Link><Link to="/admin">Admin</Link></nav>
);

function Landing() {
  const feats = [[ShieldCheck, 'Zero-knowledge privacy', 'Your proof shows eligibility. Nothing else leaves your browser.'],
    [Trees, 'Merkle-based eligibility', 'Membership in the registered-student set is checked against one public root.'],
    [EyeOff, 'Identity protection', 'No name, Student ID or email is ever sent with a complaint.'],
    [Ban, 'Duplicate prevention', 'A nullifier blocks repeat submissions without revealing who you are.']];
  return (<>
    <section className="hero"><div className="hero-in">
      <h1>Speak up.<br />Stay anonymous.</h1>
      <p>Prove that you are an eligible student without revealing who you are.</p>
      <div className="row"><Link to="/submit" className="btn light">Submit anonymous complaint</Link><Link to="/track" className="btn ghost">Track complaint</Link></div>
    </div></section>
    <div className="wrap" style={{ padding: '0 20px 60px' }}><div className="grid feat">
      {feats.map(([I, t, d]) => <div className="card" key={t}><I /><h3>{t}</h3><p>{d}</p></div>)}</div></div></>);
}

const CATS = ['Academic', 'Faculty', 'Infrastructure', 'Hostel', 'Transportation', 'Harassment', 'Examination', 'Other'];
function Submit() {
  const [secret, setSecret] = useState(''), [proof, setProof] = useState(null), [busy, setBusy] = useState(''), [err, setErr] = useState(''), [code, setCode] = useState('');
  const [f, setF] = useState({ category: 'Hostel', title: '', description: '', priority: 'Medium' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function prove() {
    setErr(''); setBusy('Generating privacy proof...');
    try {
      const { data } = await api.get('/zk/leaves');
      const result = await generateEligibilityProof(secret, data);
      setBusy('Verifying eligibility...');
      const v = await api.post('/zk/verify', result);
      v.data.valid ? setProof(result) : setErr(v.data.message);
    } catch (e) {
      setErr(e.message === 'NOT_REGISTERED' ? 'This credential is not in the registered-student set.' : e.response ? errMsg(e) : 'Invalid credential. Paste the full number you were given.');
    } finally { setBusy(''); }
  }
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy('Submitting anonymously...');
    try { const { data } = await api.post('/complaints', { ...f, ...proof }); setCode(data.complaintCode); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(''); }
  }
  if (code) return (<div className="page"><div className="card"><CheckCircle2 color="#0f9d6b" size={34} /><h1>Complaint submitted</h1>
    <p className="sub">Save this ID. It is the only way to track your complaint.</p><div className="stat mono">{code}</div>
    <Link to="/track" className="btn" style={{ marginTop: 18 }}>Track complaint</Link></div></div>);
  return (<div className="page"><h1>Anonymous complaint</h1><p className="sub">Step 1 proves you are eligible. Step 2 sends your complaint.</p>
    <div className="card"><h3>1. Prove eligibility</h3>
      {!proof ? (<><label>Anonymous credential</label><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Paste the credential your admin gave you" />
        <p className="sub" style={{ fontSize: 13 }}>Your credential is processed only in this browser and is never sent to the server.</p>
        <button className="btn" disabled={!secret || busy} onClick={prove}>{busy ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />} {busy || 'Generate zero-knowledge proof'}</button></>)
        : <div className="okbox"><b>✓ Eligibility verified</b><span>✓ Identity protected</span></div>}
    </div>
    {proof && (<form className="card" style={{ marginTop: 18 }} onSubmit={submit}><h3>2. Write your complaint</h3>
      <div className="note">Do not include your name, Student ID, email address, phone number or other identifying information.</div>
      <label>Category</label><select value={f.category} onChange={set('category')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
      <label>Title</label><input required minLength={5} maxLength={150} value={f.title} onChange={set('title')} />
      <label>Description</label><textarea required minLength={20} rows={6} value={f.description} onChange={set('description')} />
      <label>Priority</label><select value={f.priority} onChange={set('priority')}>{['Low', 'Medium', 'High'].map((c) => <option key={c}>{c}</option>)}</select>
      <button className="btn" style={{ marginTop: 18 }} disabled={!!busy}>{busy ? <Loader2 className="spin" size={16} /> : null} {busy || 'Submit anonymously'}</button></form>)}
    {err && <div className="err">{err}</div>}</div>);
}

function Track() {
  const [id, setId] = useState(''), [c, setC] = useState(null), [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); setErr(''); setC(null); try { setC((await api.get(`/complaints/${id.trim()}`)).data); } catch (x) { setErr(errMsg(x)); } };
  return (<div className="page"><h1>Track my complaint</h1><p className="sub">Enter your complaint ID. No Student ID needed.</p>
    <form className="card" onSubmit={go}><label>Complaint ID</label><input value={id} onChange={(e) => setId(e.target.value)} placeholder="CMP-7F82A91C" />
      <button className="btn" style={{ marginTop: 16 }}><Search size={16} /> Track complaint</button></form>
    {err && <div className="err">{err}</div>}
    {c && <div className="card" style={{ marginTop: 18 }}><span className={`badge ${c.status.split(' ')[0]}`}>{c.status}</span><h3 style={{ margin: '12px 0 4px' }}>{c.title}</h3>
      <p className="sub">{c.category} · Submitted {fmt(c.created_at)} · Updated {fmt(c.updated_at)}</p>
      <b>Admin response</b><p>{c.admin_remark || 'Your complaint is waiting for review.'}</p></div>}</div>);
}

function AdminLogin() {
  const nav = useNavigate(), [f, setF] = useState({ email: '', password: '' }), [err, setErr] = useState('');
  const go = async (e) => { e.preventDefault(); try { await api.post('/admin/login', f); nav('/admin/console'); } catch (x) { setErr(errMsg(x)); } };
  return (<div className="page" style={{ maxWidth: 420 }}><form className="card" onSubmit={go}><h1>Admin sign in</h1>
    <label>Email</label><input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
    <label>Password</label><input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
    {err && <div className="err">{err}</div>}<button className="btn" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>Sign in</button></form></div>);
}

const COLORS = ['#4f46e5', '#0f9d6b', '#c98a0a', '#d64545', '#0ea5e9', '#8b5cf6', '#64748b', '#14b8a6'];
const count = (rows, k) => Object.entries(rows.reduce((a, r) => ({ ...a, [r[k]]: (a[r[k]] || 0) + 1 }), {})).map(([name, value]) => ({ name, value }));

function Console() {
  const nav = useNavigate(), [tab, setTab] = useState('dash'), [rows, setRows] = useState([]), [tree, setTree] = useState({}), [students, setStudents] = useState([]);
  const [sel, setSel] = useState(null), [remark, setRemark] = useState(''), [form, setForm] = useState({ studentId: '', name: '', email: '', department: '', year: '' }), [cred, setCred] = useState(''), [err, setErr] = useState('');
  const load = async () => {
    try {
      setRows((await api.get('/admin/complaints')).data); setTree((await api.get('/admin/merkle-root')).data); setStudents((await api.get('/admin/students')).data);
    } catch { nav('/admin'); }
  };
  useEffect(() => { load(); }, []);
  const setStatus = async (id, status) => { await api.patch(`/admin/complaints/${id}/status`, { status, remark: remark || undefined }); setSel(null); setRemark(''); load(); };
  const addStudent = async (e) => {
    e.preventDefault(); setErr(''); setCred('');
    try { setCred((await api.post('/admin/students', form)).data.credential); setForm({ studentId: '', name: '', email: '', department: '', year: '' }); load(); } catch (x) { setErr(errMsg(x)); }
  };
  const deactivateStudent = async (studentId) => {
  if (!window.confirm('Are you sure you want to deactivate this student?')) {
    return;
  }

  try {
    await api.patch(`/admin/students/${studentId}/status`, {
      status: 'inactive'
    });
    load();
  } catch (e) {
    setErr(errMsg(e));
  }
};
  const S = (s) => rows.filter((r) => r.status === s).length;
  const tabs = [['dash', LayoutDashboard, 'Dashboard'], ['students', Users, 'Student registry'], ['tree', Trees, 'Merkle tree']];
  return (<div className="side"><aside>{tabs.map(([k, I, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><I size={16} />{t}</button>)}
    <button onClick={async () => { await api.post('/admin/logout'); nav('/admin'); }}><LogOut size={16} />Sign out</button></aside>
    <main>
      {tab === 'dash' && (<>
        <div className="grid">{[['Total', rows.length], ['Pending', S('Pending')], ['Under investigation', S('Under Investigation')], ['Resolved', S('Resolved')], ['Rejected', S('Rejected')]].map(([t, n]) =>
          <div className="card" key={t}><span className="sub">{t}</span><div className="stat">{n}</div></div>)}</div>
        <div className="grid" style={{ margin: '18px 0' }}>
          <div className="card"><h3>By category</h3><ResponsiveContainer height={200}><BarChart data={count(rows, 'category')}><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="#4f46e5" radius={4} /></BarChart></ResponsiveContainer></div>
          <div className="card"><h3>By priority</h3><ResponsiveContainer height={200}><PieChart><Pie data={count(rows, 'priority')} dataKey="value" nameKey="name" outerRadius={75} label>{count(rows, 'priority').map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></div>
        <div className="card" style={{ overflowX: 'auto' }}><table><thead><tr><th>ID</th><th>Category</th><th>Priority</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td className="mono">{r.complaint_code}</td><td>{r.category}</td><td>{r.priority}</td><td><span className={`badge ${r.status.split(' ')[0]}`}>{r.status}</span></td><td>{fmt(r.created_at)}</td><td><button className="btn sm out" onClick={() => setSel(r)}>View</button></td></tr>)}</tbody></table></div>
        {sel && <div className="card" style={{ marginTop: 18 }}><h3>{sel.title}</h3><p className="sub">{sel.complaint_code} · {sel.category} · {sel.priority}</p><p>{sel.description}</p>
          <div className="okbox"><span>✓ Valid proof · ✓ Valid Merkle root · ✓ Unique nullifier</span><span>✓ Anonymous eligibility confirmed</span></div>
          <p className="sub">Student identity: <b>Not available</b> · Student ID: <b>Not available</b> · Name: <b>Not available</b> · Email: <b>Not available</b></p>
          <input placeholder="Admin remark (shown to the student)" value={remark} onChange={(e) => setRemark(e.target.value)} />
          <div className="row" style={{ marginTop: 12 }}>{['Under Investigation', 'Resolved', 'Rejected'].map((s) => <button key={s} className="btn sm" onClick={() => setStatus(sel.id, s)}>{s}</button>)}</div></div>}</>)}
      {tab === 'students' && (<><form className="card" onSubmit={addStudent}><h3>Register student</h3><div className="grid">
        {[['studentId', 'Student ID'], ['name', 'Name'], ['email', 'Email'], ['department', 'Department'], ['year', 'Year']].map(([k, l]) => <div key={k}><label>{l}</label><input required={k !== 'year' && k !== 'department'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>)}</div>
        <button className="btn" style={{ marginTop: 16 }}>Register and create credential</button>
        {cred && <div className="note">Give this credential to the student now. It is shown once and is not stored.<div className="mono" style={{ marginTop: 8 }}>{cred}</div></div>}{err && <div className="err">{err}</div>}</form>
        <div className="card" style={{ marginTop: 18, overflowX: 'auto' }}><table>
  <thead>
    <tr>
      <th>Student ID</th>
      <th>Name</th>
      <th>Dept</th>
      <th>Year</th>
      <th>Status</th>
      <th>Action</th>
    </tr>
  </thead>

  <tbody>
    {students.map((s) => (
      <tr key={s.student_id}>
        <td>{s.student_id}</td>
        <td>{s.name}</td>
        <td>{s.department}</td>
        <td>{s.year}</td>
        <td>{s.status}</td>
        <td>
  {s.status === 'active' && (
    <button
      className="btn sm"
      onClick={() => deactivateStudent(s.student_id)}
    >
      Deactivate
    </button>
  )}

  <button
    className="btn sm"
    style={{ marginLeft: 8 }}
    onClick={async () => {
      if (!window.confirm(
        'Are you sure you want to permanently remove this student? This cannot be undone.'
      )) {
        return;
      }

      try {
        await api.delete(`/admin/students/${s.student_id}`);
        load();
      } catch (e) {
        setErr(errMsg(e));
      }
    }}
  >
    Remove
  </button>
</td>
      </tr>
    ))}
  </tbody>
</table></div></>)}
      {tab === 'tree' && <div className="card"><h3>Merkle tree status</h3><p className="sub">Registered students: <b>{tree.count}</b> · Nullifier scope: <b>{tree.scope}</b></p>
        <span className="badge Resolved">Active</span><p><b>Current root</b></p><div className="mono">{tree.root}</div>
        <button className="btn out" style={{ marginTop: 16 }} onClick={load}>Refresh root</button></div>}
    </main></div>);
}

export default function App() {
  return (<><Nav /><Routes><Route path="/" element={<Landing />} /><Route path="/submit" element={<Submit />} /><Route path="/track" element={<Track />} />
    <Route path="/admin" element={<AdminLogin />} /><Route path="/admin/console" element={<Console />} /></Routes></>);
}
