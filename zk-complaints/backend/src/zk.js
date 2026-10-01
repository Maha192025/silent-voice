import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';
import crypto from 'crypto';
import fs from 'fs';
import { pool } from './db.js';

export const DEPTH = 10; // must match Membership(10) in the circuit (max 1024 students)
const vkey = JSON.parse(fs.readFileSync(new URL('../zk/verification_key.json', import.meta.url)));
let poseidon;
export async function hash(...inputs) {
  poseidon ??= await buildPoseidon();
  return poseidon.F.toObject(poseidon(inputs));
}
export const newSecret = () => BigInt('0x' + crypto.randomBytes(31).toString('hex')); // 248-bit, fits the field
export const commitmentOf = (secret) => hash(secret);

export async function getLeaves() {
  const [rows] = await pool.query("SELECT commitment FROM students WHERE status='active' ORDER BY id");
  return rows.map((r) => r.commitment);
}
// Empty leaves are 0; empty subtrees use zero-hashes (identical logic runs in the browser)
export async function getRoot() {
  let level = (await getLeaves()).map(BigInt), zero = 0n;
  for (let d = 0; d < DEPTH; d++) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(await hash(level[i], level[i + 1] ?? zero));
    level = next; zero = await hash(zero, zero);
  }
  return (level[0] ?? zero).toString();
}

// Real Groth16 verification. Public signals = [root, nullifier, scope].
export async function verifyEligibility(proof, publicSignals) {
  if (!proof || !Array.isArray(publicSignals) || publicSignals.length !== 3) return { valid: false, code: 'INVALID_PROOF' };
  try {
    if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) return { valid: false, code: 'INVALID_PROOF' };
  } catch { return { valid: false, code: 'INVALID_PROOF' }; }
  const [root, nullifier, scope] = publicSignals.map(String);
  if (scope !== String(process.env.SCOPE)) return { valid: false, code: 'INVALID_PROOF' };
  if (root !== (await getRoot())) return { valid: false, code: 'STALE_ROOT' };
  const [used] = await pool.query('SELECT 1 FROM complaints WHERE nullifier=?', [nullifier]);
  if (used.length) return { valid: false, code: 'DUPLICATE' };
  return { valid: true, root, nullifier };
}
