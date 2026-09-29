"""
config.py — Central configuration for the DPR NLP Comparison Experiment.
Edit this file to change parameters without touching any other code.
"""

import os

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR         = os.path.dirname(os.path.abspath(__file__))
PDF_DIR          = os.path.join(BASE_DIR, "data", "pdfs")
GROUND_TRUTH_DIR = os.path.join(BASE_DIR, "data", "ground_truth")
RESULTS_DIR      = os.path.join(BASE_DIR, "results")
GRAPHS_DIR       = os.path.join(RESULTS_DIR, "graphs")

# ── Extraction parameters ──────────────────────────────────────────────────────
TOP_K = 20          # Number of top keywords to extract per method (change to 10, 15, etc.)

# ── TF-IDF settings ───────────────────────────────────────────────────────────
TFIDF_NGRAM_RANGE = (1, 3)   # unigrams, bigrams, trigrams
TFIDF_MAX_FEATURES = 5000    # vocabulary cap

# ── YAKE settings ─────────────────────────────────────────────────────────────
YAKE_LANGUAGE      = "en"
YAKE_MAX_NGRAM     = 3       # max phrase length
YAKE_DEDUP_THRESH  = 0.9     # deduplication threshold (0–1; lower = stricter)
YAKE_WINDOW_SIZE   = 1       # context window

# ── KeyBERT settings ──────────────────────────────────────────────────────────
KEYBERT_MODEL      = "all-MiniLM-L6-v2"   # lightweight & fast; swap for larger model if needed
KEYBERT_NGRAM_RANGE = (1, 3)
KEYBERT_DIVERSITY  = 0.5     # MMR diversity (0 = no diversity, 1 = max diversity)
KEYBERT_USE_MMR    = True    # Maximal Marginal Relevance for diverse results

# ── OCR settings ──────────────────────────────────────────────────────────────
OCR_LANGUAGE       = "eng"   # tesseract language code
OCR_DPI            = 300     # DPI for rendering PDF pages to images for OCR
MIN_TEXT_LENGTH    = 50      # chars; pages with fewer chars trigger OCR fallback

# ── Preprocessing ─────────────────────────────────────────────────────────────
REMOVE_STOPWORDS   = True
CUSTOM_STOPWORDS   = [       # domain-specific words to ignore
    "page", "figure", "table", "ref", "clause", "section",
    "shall", "may", "also", "however", "therefore", "thus",
]

# ── Matching (evaluation) ─────────────────────────────────────────────────────
# Matching method: "exact" or "normalized"
# "normalized" = lowercase + strip punctuation + collapse whitespace
MATCHING_METHOD    = "normalized"

# ── Output files ──────────────────────────────────────────────────────────────
KEYWORD_RESULTS_CSV    = os.path.join(RESULTS_DIR, "keyword_results.csv")
EVALUATION_RESULTS_CSV = os.path.join(RESULTS_DIR, "evaluation_results.csv")
SUMMARY_REPORT_TXT     = os.path.join(RESULTS_DIR, "summary_report.txt")
