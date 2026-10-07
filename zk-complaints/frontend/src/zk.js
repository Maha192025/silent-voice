import { Buffer } from 'buffer';

globalThis.Buffer = Buffer;
const DEPTH = 10;

// Runs ENTIRELY in the browser. The secret never leaves this function.
export async function generateEligibilityProof(secretText, { leaves, scope }) {
  const { buildPoseidon } = await import('circomlibjs');
  const snarkjs = await import('snarkjs');

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const h = (...x) => F.toObject(poseidon(x));
  const secret = BigInt(secretText.trim());
  const commitment = h(secret);
  let index = leaves.findIndex((l) => BigInt(l) === commitment);
  if (index < 0) throw new Error('NOT_REGISTERED');

  // Build the Merkle path locally (same padding rule as the backend)
  let level = leaves.map(BigInt), zero = 0n;
  const pathElements = [], pathIndices = [];
  for (let d = 0; d < DEPTH; d++) {
    pathElements.push((level[index ^ 1] ?? zero).toString());
    pathIndices.push(index & 1);
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(h(level[i], level[i + 1] ?? zero));
    level = next; zero = h(zero, zero); index >>= 1;
  }
  const randomBytes = new Uint8Array(31);
crypto.getRandomValues(randomBytes);

const nonce = BigInt(
  '0x' +
  Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
);

return snarkjs.groth16.fullProve(
  {
    secret: secret.toString(),
    scope: String(scope),
    nonce: nonce.toString(),
    pathElements,
    pathIndices
  },
  '/zk/membership.wasm',
  '/zk/membership_final.zkey'
);
}
