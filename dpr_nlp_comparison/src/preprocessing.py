"""
src/preprocessing.py
─────────────────────
Cleans and normalises raw text extracted from DPR PDFs.
"""

import re
import unicodedata
import logging
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import REMOVE_STOPWORDS, CUSTOM_STOPWORDS

logger = logging.getLogger(__name__)

_NLTK_STOPWORDS = None

def _get_stopwords() -> set:
    global _NLTK_STOPWORDS
    if _NLTK_STOPWORDS is None:
        try:
            from nltk.corpus import stopwords
            import nltk
            try:
                _NLTK_STOPWORDS = set(stopwords.words("english"))
            except LookupError:
                nltk.download("stopwords", quiet=True)
                _NLTK_STOPWORDS = set(stopwords.words("english"))
        except ImportError:
            _NLTK_STOPWORDS = {
                "the","a","an","and","or","but","in","on","at","to","for",
                "of","with","by","from","is","are","was","were","be","been",
                "being","have","has","had","do","does","did","will","would",
                "could","should","may","might","shall","can","this","that",
                "these","those","it","its","as","not","no",
            }
    return _NLTK_STOPWORDS | set(w.lower() for w in CUSTOM_STOPWORDS)


_RE_PAGE_HEADER   = re.compile(r"(page\s*\d+\s*(of\s*\d+)?|^\s*\d+\s*$)", re.IGNORECASE | re.MULTILINE)
_RE_MULTI_NEWLINE = re.compile(r"\n{3,}")
_RE_MULTI_SPACE   = re.compile(r"[ \t]{2,}")
_RE_PURE_NUMBER   = re.compile(r"^\d+(\.\d+)?$")
_RE_PUNCT_ONLY    = re.compile(r"^[^\w\s]+$")
_RE_SPECIAL_CHARS = re.compile(r"[|•●▪►◄→←↑↓©®™°]")


def _fix_ocr_doubled_chars(text: str) -> str:
    """
    Fix OCR artifact where every character is doubled:
    'bbuuiillddiinngg' -> 'building'
    'ccaammppuuss'     -> 'campus'

    Strategy: for each whitespace-separated token, if more than 60% of
    consecutive character pairs are identical, collapse every pair to one char.
    """
    def fix_token(token):
        if len(token) < 6:
            return token
        # Count how many consecutive pairs are identical
        pairs = len(token) // 2
        doubled = sum(1 for i in range(0, len(token) - 1, 2) if token[i] == token[i + 1])
        if pairs > 0 and (doubled / pairs) > 0.6:
            # Collapse: take every other character starting from index 0
            return token[::2]
        return token

    return " ".join(fix_token(t) for t in text.split())


def clean_text(raw_text: str) -> str:
    """Full cleaning pipeline for a single DPR document's raw text."""
    if not raw_text:
        return ""

    text = raw_text

    # 1. Normalise unicode
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")

    # 2. Remove special bullet/arrow characters
    text = _RE_SPECIAL_CHARS.sub(" ", text)

    # 3. Fix OCR doubled-character artifacts (e.g. bbuuiillddiinngg -> building)
    text = _fix_ocr_doubled_chars(text)

    # 4. Remove page number lines
    text = _RE_PAGE_HEADER.sub(" ", text)

    # 5. Collapse multiple newlines
    text = _RE_MULTI_NEWLINE.sub("\n", text)

    # 6. Collapse multiple spaces/tabs
    text = _RE_MULTI_SPACE.sub(" ", text)

    # 7. Strip per line, remove pure-number or pure-punctuation lines
    lines = [line.strip() for line in text.splitlines()]
    lines = [
        line for line in lines
        if line
        and not _RE_PURE_NUMBER.match(line)
        and not _RE_PUNCT_ONLY.match(line)
    ]

    text = " ".join(lines)
    text = re.sub(r"\s+", " ", text).strip()

    logger.debug(f"Cleaned text length: {len(text)} chars")
    return text


def preprocess_for_tfidf(text: str) -> str:
    if not REMOVE_STOPWORDS:
        return text
    stopwords = _get_stopwords()
    tokens = text.split()
    return " ".join(t for t in tokens if t.lower() not in stopwords)


def preprocess_for_yake(text: str) -> str:
    return text


def preprocess_for_keybert(text: str) -> str:
    MAX_CHARS = 50_000
    if len(text) > MAX_CHARS:
        logger.info(f"KeyBERT input truncated from {len(text)} to {MAX_CHARS} chars.")
        return text[:MAX_CHARS]
    return text
