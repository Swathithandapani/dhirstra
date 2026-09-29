"""
src/pdf_extraction.py
─────────────────────
Extracts text from PDF files.

Strategy per page:
  1. Try direct text extraction via pdfplumber.
  2. If extracted text is shorter than MIN_TEXT_LENGTH (scanned/image page),
     fall back to OCR using pdf2image + pytesseract.

Returns a dict: { dpr_id: full_text_string }
"""

import os
import sys
import logging

import pdfplumber

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import PDF_DIR, MIN_TEXT_LENGTH, OCR_LANGUAGE, OCR_DPI

logger = logging.getLogger(__name__)


def _ocr_page(pil_image) -> str:
    """Run Tesseract OCR on a PIL image and return the text."""
    try:
        import pytesseract
        return pytesseract.image_to_string(pil_image, lang=OCR_LANGUAGE)
    except ImportError:
        logger.warning("pytesseract not installed — OCR skipped for this page.")
        return ""
    except Exception as e:
        logger.warning(f"OCR failed for page: {e}")
        return ""


def _pdf_to_pil_pages(pdf_path: str):
    """Convert PDF pages to PIL images using pdf2image."""
    try:
        from pdf2image import convert_from_path
        return convert_from_path(pdf_path, dpi=OCR_DPI)
    except ImportError:
        logger.warning("pdf2image not installed — OCR fallback unavailable.")
        return []
    except Exception as e:
        logger.warning(f"pdf2image conversion failed for {pdf_path}: {e}")
        return []


def extract_text_from_pdf(pdf_path: str) -> str:
    """
    Extract all text from a single PDF.
    Uses direct extraction first; falls back to OCR for image-only pages.
    """
    full_text_parts = []
    pil_pages = None   # lazy-load only if OCR is needed

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                text = page.extract_text() or ""
                text = text.strip()

                if len(text) < MIN_TEXT_LENGTH:
                    # Page appears to be scanned — attempt OCR
                    logger.info(
                        f"  Page {page_num}: sparse text ({len(text)} chars), "
                        f"attempting OCR..."
                    )
                    if pil_pages is None:
                        pil_pages = _pdf_to_pil_pages(pdf_path)

                    if pil_pages and page_num <= len(pil_pages):
                        ocr_text = _ocr_page(pil_pages[page_num - 1])
                        if len(ocr_text.strip()) > len(text):
                            text = ocr_text
                            logger.info(
                                f"  Page {page_num}: OCR produced "
                                f"{len(text)} chars."
                            )

                full_text_parts.append(text)

    except Exception as e:
        logger.error(f"Failed to open {pdf_path}: {e}")
        return ""

    return "\n".join(full_text_parts)


def load_all_pdfs(pdf_dir: str = PDF_DIR) -> dict:
    """
    Load all PDFs from pdf_dir.
    Returns { dpr_id: text } where dpr_id is the filename without extension.
    """
    if not os.path.isdir(pdf_dir):
        logger.error(f"PDF directory not found: {pdf_dir}")
        return {}

    pdf_files = sorted(
        f for f in os.listdir(pdf_dir) if f.lower().endswith(".pdf")
    )

    if not pdf_files:
        logger.warning(f"No PDF files found in {pdf_dir}")
        return {}

    documents = {}
    for fname in pdf_files:
        dpr_id = os.path.splitext(fname)[0]
        pdf_path = os.path.join(pdf_dir, fname)
        logger.info(f"Extracting text from: {fname}")
        text = extract_text_from_pdf(pdf_path)
        if text.strip():
            documents[dpr_id] = text
            logger.info(f"  >> {len(text)} characters extracted.")
        else:
            logger.warning(f"  >> No text extracted from {fname}. Skipping.")

    return documents
