"""
blockchain.py — Lightweight Blockchain for DPR Audit Trail
============================================================
Each block stores:
  - index         : block number (0 = genesis)
  - dpr_id        : DPR file identifier
  - stage         : review stage (A-AE Review / B-AE2 Review / C-EA Review / D-SC Review)
  - action        : what happened (Submitted / Verified / Forwarded / Rejected / Approved / Correction)
  - reviewer      : who performed the action
  - timestamp     : ISO 8601 UTC
  - previous_hash : SHA-256 hash of the previous block
  - hash          : SHA-256 hash of this block's contents

Chain integrity: each block's previous_hash must equal the actual hash of
the block before it. Any tampering breaks the chain and is detected by verify_chain().

Storage: JSON file  blockchain_ledger.json  in the same directory.
"""

import hashlib
import json
import os
from datetime import datetime, timezone

LEDGER_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "blockchain_ledger.json")


# ── Hashing ────────────────────────────────────────────────────────────────────

def _hash_block(block: dict) -> str:
    """Return SHA-256 hex digest of a block (excluding the 'hash' field itself)."""
    payload = {k: v for k, v in block.items() if k != "hash"}
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ── Persistence ────────────────────────────────────────────────────────────────

def _load_chain() -> list:
    if not os.path.isfile(LEDGER_FILE):
        return []
    try:
        with open(LEDGER_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def _save_chain(chain: list) -> None:
    with open(LEDGER_FILE, "w", encoding="utf-8") as f:
        json.dump(chain, f, indent=2, ensure_ascii=False)


# ── Genesis block ──────────────────────────────────────────────────────────────

def _genesis_block() -> dict:
    block = {
        "index":         0,
        "dpr_id":        "GENESIS",
        "stage":         "System",
        "action":        "Chain Initialized",
        "reviewer":      "System",
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "previous_hash": "0" * 64,
        "hash":          "",
    }
    block["hash"] = _hash_block(block)
    return block


# ── Public API ─────────────────────────────────────────────────────────────────

def add_block(dpr_id: str, stage: str, action: str, reviewer: str) -> dict:
    """
    Append a new block to the chain and persist it.

    Parameters
    ----------
    dpr_id   : DPR file name / identifier
    stage    : One of: 'A-AE Review', 'B-AE2 Review', 'C-EA Review', 'D-SC Review'
    action   : e.g. 'Submitted', 'Verified', 'Forwarded', 'Rejected', 'Approved', 'Correction'
    reviewer : User / role who performed the action

    Returns the newly created block dict.
    """
    chain = _load_chain()

    if not chain:
        chain.append(_genesis_block())

    previous_block = chain[-1]

    new_block = {
        "index":         len(chain),
        "dpr_id":        dpr_id,
        "stage":         stage,
        "action":        action,
        "reviewer":      reviewer,
        "timestamp":     datetime.now(timezone.utc).isoformat(),
        "previous_hash": previous_block["hash"],
        "hash":          "",
    }
    new_block["hash"] = _hash_block(new_block)

    chain.append(new_block)
    _save_chain(chain)
    return new_block


def get_chain() -> list:
    """Return the full chain. Initialises with genesis block if empty."""
    chain = _load_chain()
    if not chain:
        chain.append(_genesis_block())
        _save_chain(chain)
    return chain


def get_dpr_trail(dpr_id: str) -> list:
    """Return all blocks for a specific DPR (excluding genesis)."""
    return [b for b in get_chain() if b["dpr_id"] == dpr_id]


def verify_chain() -> dict:
    """
    Verify the integrity of the entire chain.

    Checks:
      1. Each block's stored hash matches its recomputed hash.
      2. Each block's previous_hash matches the actual hash of the prior block.

    Returns
    -------
    {
      "valid"   : bool,
      "length"  : int,
      "tampered": [ { "index": int, "reason": str }, ... ]
    }
    """
    chain = _load_chain()
    tampered = []

    for i, block in enumerate(chain):
        # Check 1: hash integrity
        expected = _hash_block(block)
        if block.get("hash") != expected:
            tampered.append({
                "index":  i,
                "reason": f"Block {i} hash mismatch — content may have been altered."
            })

        # Check 2: chain linkage
        if i > 0:
            if block.get("previous_hash") != chain[i - 1].get("hash"):
                tampered.append({
                    "index":  i,
                    "reason": f"Block {i} previous_hash does not match Block {i-1} hash — chain broken."
                })

    return {
        "valid":    len(tampered) == 0,
        "length":   len(chain),
        "tampered": tampered,
    }


# ── CLI helper ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    cmd = sys.argv[1] if len(sys.argv) > 1 else "chain"

    if cmd == "add" and len(sys.argv) == 6:
        _, _, dpr_id, stage, action, reviewer = sys.argv
        block = add_block(dpr_id, stage, action, reviewer)
        print(json.dumps(block, indent=2))

    elif cmd == "trail" and len(sys.argv) == 3:
        trail = get_dpr_trail(sys.argv[2])
        print(json.dumps(trail, indent=2))

    elif cmd == "verify":
        result = verify_chain()
        print(json.dumps(result, indent=2))

    else:
        chain = get_chain()
        print(json.dumps(chain, indent=2))
