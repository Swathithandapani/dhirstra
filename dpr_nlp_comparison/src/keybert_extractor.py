"""
src/keybert_extractor.py
─────────────────────────
KeyBERT keyword extraction for DPR documents.

KeyBERT uses BERT-based sentence embeddings to find keywords/keyphrases
that are most semantically similar to the document as a whole.

Key properties:
  - Context-aware: understands meaning, not just frequency.
  - Uses Maximal Marginal Relevance (MMR) for diverse keyword selection.
  - Requires a pre-trained sentence-transformer model (downloaded once).

Parameters (from config.py):
  TOP_K               — number of keywords to return
  KEYBERT_MODEL       — sentence-transformer model name
  KEYBERT_NGRAM_RANGE — phrase length range
  KEYBERT_DIVERSITY   — MMR diversity (0–1)
  KEYBERT_USE_MMR     — whether to use MMR for diversity
"""

import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import (
    TOP_K, KEYBERT_MODEL, KEYBERT_NGRAM_RANGE,
    KEYBERT_DIVERSITY, KEYBERT_USE_MMR,
)

logger = logging.getLogger(__name__)

# Module-level model cache — load once, reuse across all documents
_kw_model = None


def _get_model():
    """Lazy-load KeyBERT model (downloads on first run, cached after)."""
    global _kw_model
    if _kw_model is None:
        try:
            from keybert import KeyBERT
            logger.info(
                f"Loading KeyBERT model: {KEYBERT_MODEL} "
                f"(first run may download ~90MB)..."
            )
            _kw_model = KeyBERT(model=KEYBERT_MODEL)
            logger.info("KeyBERT model loaded successfully.")
        except ImportError:
            logger.error(
                "keybert package not installed. "
                "Run: pip install keybert sentence-transformers"
            )
            return None
        except Exception as e:
            logger.error(f"Failed to load KeyBERT model: {e}")
            return None
    return _kw_model


def extract_keybert_keywords(documents: dict) -> dict:
    """
    Run KeyBERT on each document and return top-K keywords.

    Parameters
    ----------
    documents : dict
        { dpr_id: preprocessed_text }

    Returns
    -------
    dict
        { dpr_id: [keyword1, keyword2, ...] }  (length ≤ TOP_K)
    """
    model = _get_model()
    if model is None:
        return {dpr_id: [] for dpr_id in documents}

    results = {}

    for dpr_id, text in documents.items():
        if not text.strip():
            logger.warning(f"  KeyBERT [{dpr_id}]: empty text, skipping.")
            results[dpr_id] = []
            continue

        try:
            keyword_score_pairs = model.extract_keywords(
                text,
                keyphrase_ngram_range=KEYBERT_NGRAM_RANGE,
                stop_words="english",
                use_mmr=KEYBERT_USE_MMR,
                diversity=KEYBERT_DIVERSITY,
                top_n=TOP_K,
            )
            keywords = [kw for kw, _score in keyword_score_pairs]
            results[dpr_id] = keywords
            logger.info(
                f"  KeyBERT [{dpr_id}]: {len(keywords)} keywords extracted."
            )
        except Exception as e:
            logger.error(f"  KeyBERT [{dpr_id}]: extraction failed — {e}")
            results[dpr_id] = []

    return results
