#!/usr/bin/env bash
# Requires circom 2 (https://docs.circom.io/getting-started/installation/) and Node.js
set -e
cd "$(dirname "$0")"
npm init -y >/dev/null && npm i circomlib snarkjs
circom membership.circom --r1cs --wasm -l node_modules
npx snarkjs powersoftau new bn128 14 pot0.ptau
npx snarkjs powersoftau contribute pot0.ptau pot1.ptau --name="c1" -e="$(head -c 32 /dev/urandom | xxd -p)"
npx snarkjs powersoftau prepare phase2 pot1.ptau pot_final.ptau
npx snarkjs groth16 setup membership.r1cs pot_final.ptau m0.zkey
npx snarkjs zkey contribute m0.zkey membership_final.zkey --name="c2" -e="$(head -c 32 /dev/urandom | xxd -p)"
npx snarkjs zkey export verificationkey membership_final.zkey verification_key.json
cp membership_js/membership.wasm membership_final.zkey ../frontend/public/zk/
cp verification_key.json ../backend/zk/
echo "Trusted setup done."
