"""
src/yake_extractor.py
──────────────────────
YAKE (Yet Another Keyword Extractor) keyword extraction for DPR documents.

YAKE is an unsupervised, language-independent method that uses statistical
features from the text itself (no training data required).

Key properties:
  - Lower YAKE score = more important keyword (unlike TF-IDF/KeyBERT).
  - Works well on technical/domain-specific documents.
  - Handles n-grams natively.

Parameters (from config.py):
  TOP_K             — number of keywords to return
  YAKE_LANGUAGE     — language code (default "en")
  YAKE_MAX_NGRAM    — maximum phrase length
  YAKE_DEDUP_THRESH — deduplication threshold
  YAKE_WINDOW_SIZE  — context window size
"""

import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    TOP_K, YAKE_LANGUAGE, YAKE_MAX_NGRAM,
    YAKE_DEDUP_THRESH, YAKE_WINDOW_SIZE,
)

logger = logging.getLogger(__name__)


def extract_yake_keywords(documents: dict) -> dict:
    """
    Run YAKE on each document independently and return top-K keywords.

    Parameters
    ----------
    documents : dict
        { dpr_id: preprocessed_text }

    Returns
    -------
    dict
        { dpr_id: [keyword1, keyword2, ...] }  (length ≤ TOP_K)
    """
    try:
        import yake
    except ImportError:
        logger.error(
            "yake package not installed. Run: pip install yake"
        )
        return {dpr_id: [] for dpr_id in documents}

    # YAKE extractor is stateless per document — create once, reuse
    extractor = yake.KeywordExtractor(
        lan=YAKE_LANGUAGE,
        n=YAKE_MAX_NGRAM,
        dedupLim=YAKE_DEDUP_THRESH,
        windowsSize=YAKE_WINDOW_SIZE,
        top=TOP_K,
        features=None,   # use all default statistical features
    )

    results = {}

    for dpr_id, text in documents.items():
        if not text.strip():
            logger.warning(f"  YAKE [{dpr_id}]: empty text, skipping.")
            results[dpr_id] = []
            continue

        try:
            # Returns list of (keyword, score) — lower score = more important
            keyword_score_pairs = extractor.extract_keywords(text)
            keywords = [kw for kw, _score in keyword_score_pairs]
            results[dpr_id] = keywords
            logger.info(
                f"  YAKE [{dpr_id}]: {len(keywords)} keywords extracted."
            )
        except Exception as e:
            logger.error(f"  YAKE [{dpr_id}]: extraction failed — {e}")
            results[dpr_id] = []

    return results
