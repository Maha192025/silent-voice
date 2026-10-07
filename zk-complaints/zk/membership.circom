pragma circom 2.0.0;
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Proves: "I know a secret whose Poseidon commitment is a leaf of the Merkle tree
// with this root", and outputs nullifier = Poseidon(secret, scope).
// Public signals order: [root, nullifier, scope]
template Membership(levels) {
    signal input secret;                 // private
    signal input pathElements[levels];   // private
    signal input pathIndices[levels];    // private (0 = left, 1 = right)
    signal input scope;
    signal input nonce;                  // private
    signal output root;
    signal output nullifier;

    component commit = Poseidon(1);
    commit.inputs[0] <== secret;
    component base = Poseidon(2);
    base.inputs[0] <== secret;
    base.inputs[1] <== scope;

    component nul = Poseidon(2);
    nul.inputs[0] <== base.out;
    nul.inputs[1] <== nonce;

    nullifier <== nul.out;

    signal hashes[levels + 1];
    hashes[0] <== commit.out;
    component mux[levels];
    component hasher[levels];
    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== hashes[i];       mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i]; mux[i].c[1][1] <== hashes[i];
        mux[i].s <== pathIndices[i];
        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== mux[i].out[0];
        hasher[i].inputs[1] <== mux[i].out[1];
        hashes[i + 1] <== hasher[i].out;
    }
    root <== hashes[levels];
}
component main {public [scope]} = Membership(10);
