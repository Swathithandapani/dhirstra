"""
main.py — Single entry point for the DPR NLP Comparison Experiment.

Usage:
    python main.py                    # run full experiment
    python main.py --top-k 10         # override TOP_K
    python main.py --pdf-dir /path    # use a different PDF folder
    python main.py --skip-keybert     # skip KeyBERT (faster, no GPU needed)

Steps executed:
  1. Load and extract text from all PDFs in data/pdfs/
  2. Preprocess text for each method
  3. Run TF-IDF, YAKE, KeyBERT extraction
  4. Save extracted keywords to results/keyword_results.csv
  5. Load ground-truth files and compute Precision/Recall/F1
  6. Save evaluation results to results/evaluation_results.csv
  7. Generate comparison graphs in results/graphs/
  8. Print summary report to console and save to results/summary_report.txt
"""

import os
import sys
import csv
import json
import logging
import argparse
from datetime import datetime

# ── Setup path ─────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
sys.path.insert(0, os.path.join(BASE_DIR, "src"))

import config

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(
            os.path.join(BASE_DIR, "results", "experiment.log"),
            mode="w", encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger(__name__)


# ── Argument parsing ───────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(
        description="DPR NLP Keyword Extraction Comparison Experiment"
    )
    parser.add_argument(
        "--top-k", type=int, default=None,
        help=f"Number of top keywords to extract (default: {config.TOP_K})"
    )
    parser.add_argument(
        "--pdf-dir", type=str, default=None,
        help="Path to folder containing DPR PDFs"
    )
    parser.add_argument(
        "--skip-keybert", action="store_true",
        help="Skip KeyBERT extraction (faster, no model download needed)"
    )
    parser.add_argument(
        "--skip-ocr", action="store_true",
        help="Disable OCR fallback for scanned pages"
    )
    return parser.parse_args()


# ── CSV helpers ────────────────────────────────────────────────────────────────
def save_keyword_results(
    tfidf: dict, yake: dict, keybert: dict, path: str
) -> None:
    """Save all extracted keywords to a CSV for manual inspection."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    all_ids = sorted(set(tfidf) | set(yake) | set(keybert))

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "DPR_ID", "Rank",
            "TF-IDF Keyword", "YAKE Keyword", "KeyBERT Keyword"
        ])
        for dpr_id in all_ids:
            t_kws = tfidf.get(dpr_id, [])
            y_kws = yake.get(dpr_id, [])
            k_kws = keybert.get(dpr_id, [])
            max_len = max(len(t_kws), len(y_kws), len(k_kws), 1)
            for i in range(max_len):
                writer.writerow([
                    dpr_id if i == 0 else "",
                    i + 1,
                    t_kws[i] if i < len(t_kws) else "",
                    y_kws[i] if i < len(y_kws) else "",
                    k_kws[i] if i < len(k_kws) else "",
                ])
    logger.info(f"Keyword results saved: {path}")


def save_evaluation_results(rows: list, path: str) -> None:
    """Save per-document evaluation metrics to CSV."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fieldnames = [
        "DPR_ID", "Method",
        "Precision", "Recall", "F1_Score",
        "Num_Extracted", "Num_Ground_Truth",
        "Ground_Truth_Available", "TP", "FP", "FN",
    ]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "DPR_ID":                  row["dpr_id"],
                "Method":                  row["method"],
                "Precision":               row["precision"] if row["precision"] is not None else "N/A",
                "Recall":                  row["recall"]    if row["recall"]    is not None else "N/A",
                "F1_Score":                row["f1"]        if row["f1"]        is not None else "N/A",
                "Num_Extracted":           row["num_extracted"],
                "Num_Ground_Truth":        row["num_ground_truth"],
                "Ground_Truth_Available":  row["ground_truth_available"],
                "TP":                      row["tp"] if row["tp"] is not None else "N/A",
                "FP":                      row["fp"] if row["fp"] is not None else "N/A",
                "FN":                      row["fn"] if row["fn"] is not None else "N/A",
            })
    logger.info(f"Evaluation results saved: {path}")


# ── Summary report ─────────────────────────────────────────────────────────────
def print_and_save_summary(averages: dict, eval_rows: list, path: str) -> None:
    """Print summary table to console and save to text file."""
    lines = []
    sep = "=" * 65

    lines.append(sep)
    lines.append("  DPR NLP KEYWORD EXTRACTION — EXPERIMENT SUMMARY")
    lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(sep)
    lines.append("")

    # Per-document table
    lines.append("PER-DOCUMENT RESULTS:")
    lines.append("-" * 65)
    header = f"{'DPR ID':<30} {'Method':<10} {'P':>7} {'R':>7} {'F1':>7}"
    lines.append(header)
    lines.append("-" * 65)

    for row in eval_rows:
        if not row["ground_truth_available"]:
            p_str = r_str = f_str = "  N/A "
        else:
            p_str = f"{row['precision']:.4f}" if row["precision"] is not None else "  N/A "
            r_str = f"{row['recall']:.4f}"    if row["recall"]    is not None else "  N/A "
            f_str = f"{row['f1']:.4f}"        if row["f1"]        is not None else "  N/A "
        lines.append(
            f"{row['dpr_id']:<30} {row['method']:<10} "
            f"{p_str:>7} {r_str:>7} {f_str:>7}"
        )

    lines.append("")
    lines.append("AVERAGE SCORES (documents with ground truth only):")
    lines.append("-" * 65)
    lines.append(f"{'Method':<12} {'Avg Precision':>15} {'Avg Recall':>12} {'Avg F1':>10} {'Docs':>6}")
    lines.append("-" * 65)

    best_method = None
    best_f1     = -1.0

    for method in ["TF-IDF", "YAKE", "KeyBERT"]:
        if method not in averages:
            lines.append(f"{method:<12} {'N/A':>15} {'N/A':>12} {'N/A':>10} {'0':>6}")
            continue
        avg = averages[method]
        p   = f"{avg['avg_precision']:.4f}" if avg["avg_precision"] is not None else "N/A"
        r   = f"{avg['avg_recall']:.4f}"    if avg["avg_recall"]    is not None else "N/A"
        f1  = f"{avg['avg_f1']:.4f}"        if avg["avg_f1"]        is not None else "N/A"
        n   = str(avg["num_docs"])
        lines.append(f"{method:<12} {p:>15} {r:>12} {f1:>10} {n:>6}")

        if avg["avg_f1"] is not None and avg["avg_f1"] > best_f1:
            best_f1     = avg["avg_f1"]
            best_method = method

    lines.append("")
    lines.append(sep)
    if best_method:
        lines.append(
            f"  BEST METHOD (by Avg F1-score): {best_method}  "
            f"[F1 = {best_f1:.4f}]"
        )
        lines.append(
            "  Recommended for integration into the DPR Evaluation System."
        )
    else:
        lines.append(
            "  BEST METHOD: Cannot be determined -- "
            "no ground-truth files found."
        )
        lines.append(
            "  Please add ground-truth JSON files to data/ground_truth/ "
            "and re-run."
        )
    lines.append(sep)
    lines.append("")
    lines.append("NOTE ON MATCHING METHOD:")
    lines.append(
        f"  config.MATCHING_METHOD = '{config.MATCHING_METHOD}'"
    )
    lines.append(
        "  'normalized' = lowercase + remove punctuation + collapse whitespace."
    )
    lines.append(
        "  This avoids artificially inflating scores through overly loose matching."
    )
    lines.append("")

    report = "\n".join(lines)
    # Use stdout with utf-8 encoding to avoid Windows cp1252 crash
    sys.stdout.buffer.write((report + "\n").encode("utf-8"))

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(report)
    logger.info(f"Summary report saved: {path}")


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()

    # Apply CLI overrides to config
    if args.top_k:
        config.TOP_K = args.top_k
        logger.info(f"TOP_K overridden to {config.TOP_K}")
    if args.pdf_dir:
        config.PDF_DIR = args.pdf_dir
        logger.info(f"PDF_DIR overridden to {config.PDF_DIR}")
    if args.skip_ocr:
        config.MIN_TEXT_LENGTH = 0   # disables OCR fallback
        logger.info("OCR fallback disabled.")

    os.makedirs(config.RESULTS_DIR, exist_ok=True)
    os.makedirs(config.GRAPHS_DIR,  exist_ok=True)

    logger.info("=" * 60)
    logger.info("  DPR NLP KEYWORD EXTRACTION COMPARISON EXPERIMENT")
    logger.info("=" * 60)
    logger.info(f"  TOP_K          = {config.TOP_K}")
    logger.info(f"  PDF_DIR        = {config.PDF_DIR}")
    logger.info(f"  MATCHING       = {config.MATCHING_METHOD}")
    logger.info(f"  Skip KeyBERT   = {args.skip_keybert}")
    logger.info("=" * 60)

    # ── Step 1: Extract text from PDFs ────────────────────────────────────────
    logger.info("\n[STEP 1] Extracting text from PDFs...")
    from pdf_extraction import load_all_pdfs
    raw_documents = load_all_pdfs(config.PDF_DIR)

    if not raw_documents:
        logger.error(
            f"No documents loaded from {config.PDF_DIR}.\n"
            f"Please copy your DPR PDF files into: {config.PDF_DIR}"
        )
        sys.exit(1)

    logger.info(f"  Loaded {len(raw_documents)} document(s).")

    # ── Step 2: Preprocess ────────────────────────────────────────────────────
    logger.info("\n[STEP 2] Preprocessing text...")
    from preprocessing import (
        clean_text, preprocess_for_tfidf,
        preprocess_for_yake, preprocess_for_keybert,
    )

    cleaned = {did: clean_text(txt) for did, txt in raw_documents.items()}

    tfidf_inputs   = {did: preprocess_for_tfidf(txt)   for did, txt in cleaned.items()}
    yake_inputs    = {did: preprocess_for_yake(txt)    for did, txt in cleaned.items()}
    keybert_inputs = {did: preprocess_for_keybert(txt) for did, txt in cleaned.items()}

    # ── Step 3: Keyword extraction ────────────────────────────────────────────
    logger.info("\n[STEP 3] Running keyword extraction...")

    logger.info("  >> TF-IDF...")
    from tfidf_extractor import extract_tfidf_keywords
    tfidf_results = extract_tfidf_keywords(tfidf_inputs)

    logger.info("  >> YAKE...")
    from yake_extractor import extract_yake_keywords
    yake_results = extract_yake_keywords(yake_inputs)

    if not args.skip_keybert:
        logger.info("  >> KeyBERT (may take a moment on first run)...")
        from keybert_extractor import extract_keybert_keywords
        keybert_results = extract_keybert_keywords(keybert_inputs)
    else:
        logger.info("  >> KeyBERT: SKIPPED (--skip-keybert flag set).")
        keybert_results = {did: [] for did in cleaned}

    # ── Step 4: Save keyword results ──────────────────────────────────────────
    logger.info("\n[STEP 4] Saving extracted keywords...")
    save_keyword_results(
        tfidf_results, yake_results, keybert_results,
        config.KEYWORD_RESULTS_CSV,
    )

    # ── Step 5: Evaluate ──────────────────────────────────────────────────────
    logger.info("\n[STEP 5] Evaluating against ground truth...")
    from evaluation import evaluate_all, compute_averages
    eval_rows = evaluate_all(tfidf_results, yake_results, keybert_results)
    averages  = compute_averages(eval_rows)

    # ── Step 6: Save evaluation results ──────────────────────────────────────
    logger.info("\n[STEP 6] Saving evaluation results...")
    save_evaluation_results(eval_rows, config.EVALUATION_RESULTS_CSV)

    # ── Step 7: Generate graphs ───────────────────────────────────────────────
    logger.info("\n[STEP 7] Generating graphs...")
    from visualization import generate_all_graphs
    generate_all_graphs(averages)

    # ── Step 8: Summary report ────────────────────────────────────────────────
    logger.info("\n[STEP 8] Generating summary report...")
    print_and_save_summary(averages, eval_rows, config.SUMMARY_REPORT_TXT)

    logger.info("\nExperiment complete.")
    logger.info(f"Results saved in: {config.RESULTS_DIR}")


if __name__ == "__main__":
    main()
