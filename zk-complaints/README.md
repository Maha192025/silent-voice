# Silent Voice: Anonymous Complaints with Zero-Knowledge Proofs

## Setup
1. **MySQL**: run `backend/schema.sql`.
2. **Backend**: `cd backend && cp .env.example .env` (edit values), `npm i`.
3. **ZKP** (needs circom 2 installed): `bash zk/setup.sh`. Compiles the circuit, runs the Groth16 setup, and copies the `.wasm`/`.zkey` to the frontend and `verification_key.json` to the backend.
4. **Run**: `cd backend && npm run dev`, then `cd frontend && npm i && npm run dev` (http://localhost:5173).

## Flow
Admin (`/admin`) registers a student and receives a one-time credential (a random secret; only `Poseidon(secret)` is stored). The student pastes it on `/submit`; the browser builds the Merkle path from public leaves and generates a Groth16 proof. The server verifies the proof, checks the root, checks the nullifier `Poseidon(secret, scope)` is unused, then stores the complaint with no student data.

## Limitations
The admin who issues a credential briefly sees the secret. Production use would let students generate their own secret and submit only the commitment.
