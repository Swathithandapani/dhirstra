"""
src/evaluation.py
──────────────────
Loads ground-truth keyword files and computes Precision, Recall, F1-score
for each (DPR, method) pair.

Ground-truth file format (JSON):
  data/ground_truth/<dpr_id>.json
  Example:
    {
      "dpr_id": "DPR_001",
      "keywords": [
        "project cost",
        "RCC construction",
        "M25 concrete",
        "project duration",
        "earthwork excavation"
      ]
    }

Matching method (controlled by config.MATCHING_METHOD):
  "normalized" — lowercase + strip punctuation + collapse whitespace.
  "exact"      — case-sensitive exact string match.

Metrics:
  TP = extracted keywords that match a ground-truth keyword
  FP = extracted keywords that do NOT match any ground-truth keyword
  FN = ground-truth keywords NOT matched by any extracted keyword

  Precision = TP / (TP + FP)   [what fraction of extracted is correct]
  Recall    = TP / (TP + FN)   [what fraction of ground truth was found]
  F1        = 2 * P * R / (P + R)
"""

import os
import json
import re
import logging
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import GROUND_TRUTH_DIR, MATCHING_METHOD

logger = logging.getLogger(__name__)


# ── Normalisation ──────────────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    """
    Normalize a keyword for matching:
      - Lowercase
      - Remove punctuation (keep hyphens within words)
      - Collapse whitespace
    """
    text = text.lower()
    text = re.sub(r"[^\w\s\-]", "", text)   # remove punctuation except hyphens
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _match(extracted: str, ground_truth: str) -> bool:
    """Return True if extracted keyword matches a ground-truth keyword."""
    if MATCHING_METHOD == "exact":
        return extracted == ground_truth
    else:  # "normalized"
        return _normalize(extracted) == _normalize(ground_truth)


# ── Ground-truth loading ───────────────────────────────────────────────────────

def load_ground_truth(dpr_id: str) -> list | None:
    """
    Load ground-truth keywords for a DPR from its JSON file.
    Returns list of keyword strings, or None if file not found.
    """
    gt_path = os.path.join(GROUND_TRUTH_DIR, f"{dpr_id}.json")
    if not os.path.isfile(gt_path):
        return None

    try:
        with open(gt_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        keywords = data.get("keywords", [])
        if not isinstance(keywords, list):
            logger.error(f"Ground truth for {dpr_id}: 'keywords' must be a list.")
            return None
        return [str(k) for k in keywords]
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in ground truth file for {dpr_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Could not load ground truth for {dpr_id}: {e}")
        return None


# ── Metric calculation ─────────────────────────────────────────────────────────

def compute_metrics(extracted: list, ground_truth: list) -> dict:
    """
    Compute Precision, Recall, F1 for one (document, method) pair.

    Parameters
    ----------
    extracted    : list of extracted keyword strings
    ground_truth : list of ground-truth keyword strings

    Returns
    -------
    dict with keys: precision, recall, f1, tp, fp, fn
    """
    if not ground_truth:
        return dict(precision=None, recall=None, f1=None, tp=0, fp=0, fn=0)

    if not extracted:
        return dict(precision=0.0, recall=0.0, f1=0.0,
                    tp=0, fp=0, fn=len(ground_truth))

    # Track which ground-truth keywords have been matched (avoid double-counting)
    gt_matched = [False] * len(ground_truth)
    tp = 0

    for ext_kw in extracted:
        for gt_idx, gt_kw in enumerate(ground_truth):
            if not gt_matched[gt_idx] and _match(ext_kw, gt_kw):
                tp += 1
                gt_matched[gt_idx] = True
                break

    fp = len(extracted) - tp
    fn = len(ground_truth) - tp

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = (2 * precision * recall / (precision + recall)
                 if (precision + recall) > 0 else 0.0)

    return dict(
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1=round(f1, 4),
        tp=tp, fp=fp, fn=fn,
    )


# ── Full evaluation ────────────────────────────────────────────────────────────

def evaluate_all(
    tfidf_results: dict,
    yake_results: dict,
    keybert_results: dict,
) -> list:
    """
    Evaluate all three methods across all DPR documents.

    Returns a list of result dicts, one per (dpr_id, method) combination.
    Each dict contains:
      dpr_id, method, precision, recall, f1,
      num_extracted, num_ground_truth,
      ground_truth_available, tp, fp, fn
    """
    all_dpr_ids = sorted(
        set(tfidf_results) | set(yake_results) | set(keybert_results)
    )

    rows = []

    for dpr_id in all_dpr_ids:
        gt_keywords = load_ground_truth(dpr_id)
        gt_available = gt_keywords is not None
        gt_count = len(gt_keywords) if gt_available else 0

        if not gt_available:
            logger.warning(
                f"[{dpr_id}] No ground-truth file found. "
                f"Precision/Recall/F1 will not be calculated."
            )

        method_results = {
            "TF-IDF":  tfidf_results.get(dpr_id, []),
            "YAKE":    yake_results.get(dpr_id, []),
            "KeyBERT": keybert_results.get(dpr_id, []),
        }

        for method, extracted in method_results.items():
            if gt_available:
                metrics = compute_metrics(extracted, gt_keywords)
            else:
                metrics = dict(
                    precision=None, recall=None, f1=None,
                    tp=None, fp=None, fn=None,
                )

            rows.append({
                "dpr_id":               dpr_id,
                "method":               method,
                "precision":            metrics["precision"],
                "recall":               metrics["recall"],
                "f1":                   metrics["f1"],
                "num_extracted":        len(extracted),
                "num_ground_truth":     gt_count,
                "ground_truth_available": gt_available,
                "tp":                   metrics["tp"],
                "fp":                   metrics["fp"],
                "fn":                   metrics["fn"],
            })

    return rows


def compute_averages(evaluation_rows: list) -> dict:
    """
    Compute average Precision, Recall, F1 per method
    (only over documents that have ground truth).

    Returns { method: {avg_precision, avg_recall, avg_f1, num_docs} }
    """
    from collections import defaultdict

    method_scores = defaultdict(lambda: {"p": [], "r": [], "f": []})

    for row in evaluation_rows:
        if not row["ground_truth_available"]:
            continue
        m = row["method"]
        if row["precision"] is not None:
            method_scores[m]["p"].append(row["precision"])
            method_scores[m]["r"].append(row["recall"])
            method_scores[m]["f"].append(row["f1"])

    averages = {}
    for method, scores in method_scores.items():
        n = len(scores["f"])
        averages[method] = {
            "avg_precision": round(sum(scores["p"]) / n, 4) if n else None,
            "avg_recall":    round(sum(scores["r"]) / n, 4) if n else None,
            "avg_f1":        round(sum(scores["f"]) / n, 4) if n else None,
            "num_docs":      n,
        }

    return averages
