# DPR NLP Keyword Extraction — Comparison Experiment

A research experiment comparing **TF-IDF**, **YAKE**, and **KeyBERT** for
keyword extraction from Detailed Project Report (DPR) documents.

---

## Project Structure

```
dpr_nlp_comparison/
│
├── data/
│   ├── pdfs/                    ← Place your DPR PDF files here
│   └── ground_truth/            ← Place ground-truth JSON files here
│       └── TEMPLATE_ground_truth.json
│
├── src/
│   ├── pdf_extraction.py        ← PDF text extraction + OCR fallback
│   ├── preprocessing.py         ← Text cleaning and normalisation
│   ├── tfidf_extractor.py       ← TF-IDF keyword extraction
│   ├── yake_extractor.py        ← YAKE keyword extraction
│   ├── keybert_extractor.py     ← KeyBERT keyword extraction
│   ├── evaluation.py            ← Precision / Recall / F1 calculation
│   └── visualization.py         ← Graph generation
│
├── results/                     ← Auto-created when you run main.py
│   ├── keyword_results.csv      ← All extracted keywords (all 3 methods)
│   ├── evaluation_results.csv   ← Per-document P/R/F1 scores
│   ├── summary_report.txt       ← Final summary + best method
│   ├── experiment.log           ← Full execution log
│   └── graphs/
│       ├── precision_recall_f1_comparison.png
│       └── f1_score_comparison.png
│
├── config.py                    ← All tunable parameters (edit here)
├── main.py                      ← Single entry point
├── requirements.txt
└── README.md
```

---

## Setup

### 1. Prerequisites

- Python 3.9 or higher
- pip
- For OCR on scanned PDFs: [Tesseract OCR](https://github.com/tesseract-ocr/tesseract)
  installed on your system (not a Python package — install separately)
  - Windows: download installer from https://github.com/UB-Mannheim/tesseract/wiki
  - After installing, add Tesseract to your PATH

### 2. Install Python dependencies

```bash
cd dpr_nlp_comparison
pip install -r requirements.txt
```

> **Note:** The first run will download the KeyBERT sentence-transformer model
> (~90 MB). This is a one-time download.

### 3. Download NLTK stopwords (one-time)

```python
python -c "import nltk; nltk.download('stopwords')"
```

---

## Step-by-Step Usage

### Step 1 — Add your DPR PDFs

Copy your DPR PDF files into:
```
dpr_nlp_comparison/data/pdfs/
```

Example:
```
data/pdfs/DPR_001.pdf
data/pdfs/DPR_002.pdf
data/pdfs/DPR_003.pdf
```

The filename (without `.pdf`) becomes the **DPR ID** used throughout the experiment.

---

### Step 2 — Create ground-truth keyword files

For each DPR, create a JSON file in `data/ground_truth/` named
`<dpr_id>.json` (must match the PDF filename exactly).

**Example:** For `DPR_001.pdf`, create `data/ground_truth/DPR_001.json`:

```json
{
  "dpr_id": "DPR_001",
  "keywords": [
    "project cost",
    "RCC construction",
    "M25 concrete",
    "project duration",
    "earthwork excavation",
    "reinforced cement concrete",
    "detailed project report",
    "construction agency",
    "estimated cost",
    "structural design"
  ]
}
```

**How to choose ground-truth keywords:**
- Read the DPR document yourself.
- Identify the most important technical terms, project-specific phrases,
  and concepts that a government official would need to find.
- Use lowercase phrases.
- Aim for 10–20 keywords per document.
- Use the `TEMPLATE_ground_truth.json` file as a starting point.

> **Important:** If no ground-truth file exists for a DPR, the experiment
> will still extract keywords but will report `N/A` for Precision/Recall/F1
> rather than generating fake scores.

---

### Step 3 — Run the experiment

```bash
cd dpr_nlp_comparison
python main.py
```

**Optional flags:**

```bash
# Change number of top keywords (default: 20)
python main.py --top-k 10

# Use a different PDF folder
python main.py --pdf-dir /path/to/your/pdfs

# Skip KeyBERT (faster, no model download needed)
python main.py --skip-keybert

# Disable OCR fallback (for text-based PDFs only)
python main.py --skip-ocr
```

---

### Step 4 — View results

After running, check the `results/` folder:

| File | Contents |
|------|----------|
| `keyword_results.csv` | All extracted keywords from all 3 methods, side by side |
| `evaluation_results.csv` | Precision, Recall, F1 per document per method |
| `summary_report.txt` | Average scores + best method recommendation |
| `graphs/precision_recall_f1_comparison.png` | Grouped bar chart |
| `graphs/f1_score_comparison.png` | F1-score comparison with best method highlighted |

---

## Configuration

Edit `config.py` to change experiment parameters:

```python
TOP_K = 20              # Number of keywords to extract per method

TFIDF_NGRAM_RANGE = (1, 3)   # Include unigrams, bigrams, trigrams
YAKE_MAX_NGRAM = 3            # YAKE max phrase length
KEYBERT_MODEL = "all-MiniLM-L6-v2"  # Swap for larger model if needed

MATCHING_METHOD = "normalized"  # "normalized" or "exact"
```

---

## Evaluation Metrics

```
Precision = TP / (TP + FP)   — of all extracted keywords, how many are correct
Recall    = TP / (TP + FN)   — of all ground-truth keywords, how many were found
F1        = 2 × P × R / (P + R)  — harmonic mean of Precision and Recall
```

**Matching method (`normalized`):**
- Convert to lowercase
- Remove punctuation (except hyphens within words)
- Collapse whitespace

This avoids artificially inflating scores through overly loose matching.

---

## Adding More DPR Documents

Simply:
1. Copy the new PDF into `data/pdfs/`
2. Create its ground-truth JSON in `data/ground_truth/`
3. Re-run `python main.py`

The experiment automatically processes all PDFs in the folder.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `No PDF files found` | Check that PDFs are in `data/pdfs/` and have `.pdf` extension |
| `OCR failed` | Install Tesseract: https://github.com/UB-Mannheim/tesseract/wiki |
| `KeyBERT model download fails` | Check internet connection; or use `--skip-keybert` |
| `yake not found` | Run `pip install yake` |
| `N/A for all scores` | Create ground-truth JSON files in `data/ground_truth/` |
| Graphs not generated | Run `pip install matplotlib` |

---

## Research Purpose

This experiment determines which keyword extraction technique performs best
on DPR documents so that the selected method can be integrated into the
main DPR Evaluation System — enabling government officials to automatically
identify key information without manually reading entire documents.
