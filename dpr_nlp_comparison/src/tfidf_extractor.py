"""
src/tfidf_extractor.py
───────────────────────
TF-IDF keyword extraction for DPR documents.
"""

import logging
import sys
import os

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import TOP_K, TFIDF_NGRAM_RANGE, TFIDF_MAX_FEATURES

logger = logging.getLogger(__name__)


def extract_tfidf_keywords(documents: dict) -> dict:
    if not documents:
        logger.error("No documents provided to TF-IDF extractor.")
        return {}

    dpr_ids = list(documents.keys())
    texts   = [documents[d] for d in dpr_ids]

    # With very few docs, max_df=0.95 prunes all terms — use 1.0 for small corpora
    n_docs  = len(texts)
    max_df  = 0.95 if n_docs >= 10 else 1.0

    logger.info(
        f"TF-IDF: fitting on {n_docs} documents, "
        f"ngram_range={TFIDF_NGRAM_RANGE}, max_features={TFIDF_MAX_FEATURES}, "
        f"max_df={max_df}"
    )

    vectorizer = TfidfVectorizer(
        ngram_range=TFIDF_NGRAM_RANGE,
        max_features=TFIDF_MAX_FEATURES,
        sublinear_tf=True,
        min_df=1,
        max_df=max_df,
        strip_accents="unicode",
        analyzer="word",
        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z0-9\-]{1,}\b",
    )

    try:
        tfidf_matrix = vectorizer.fit_transform(texts)
    except Exception as e:
        logger.error(f"TF-IDF vectorisation failed: {e}")
        return {}

    feature_names = np.array(vectorizer.get_feature_names_out())
    results = {}

    for idx, dpr_id in enumerate(dpr_ids):
        row = tfidf_matrix[idx].toarray().flatten()
        top_indices  = row.argsort()[::-1][:TOP_K]
        top_keywords = [feature_names[i] for i in top_indices if row[i] > 0]
        results[dpr_id] = top_keywords
        logger.info(f"  TF-IDF [{dpr_id}]: {len(top_keywords)} keywords extracted.")

    return results
