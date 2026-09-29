"""
src/visualization.py
─────────────────────
Generates professional comparison graphs from the actual experiment results.

Graph 1 — Grouped bar chart:
  X-axis: TF-IDF | YAKE | KeyBERT
  Y-axis: Score (0–1)
  Bars:   Precision, Recall, F1-score (grouped per method)

Graph 2 — F1-score comparison bar chart:
  X-axis: TF-IDF | YAKE | KeyBERT
  Y-axis: Average F1-score
  Highlights the best-performing method.

All values come from the actual computed averages — no hardcoded numbers.
"""

import os
import logging
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import GRAPHS_DIR

logger = logging.getLogger(__name__)

METHODS = ["TF-IDF", "YAKE", "KeyBERT"]

# Colour palette — accessible, professional
COLORS = {
    "Precision": "#2196F3",   # blue
    "Recall":    "#4CAF50",   # green
    "F1-score":  "#FF5722",   # deep orange
}

BEST_COLOR    = "#FFD700"   # gold highlight for best method
DEFAULT_COLOR = "#607D8B"   # blue-grey for non-best


def _safe_val(v) -> float:
    """Return 0.0 for None values (no ground truth available)."""
    return float(v) if v is not None else 0.0


def plot_grouped_bar(averages: dict, output_path: str) -> None:
    """
    Graph 1: Grouped bar chart — Precision, Recall, F1 per method.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")   # non-interactive backend (safe for all environments)
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        logger.error("matplotlib not installed. Run: pip install matplotlib")
        return

    methods_present = [m for m in METHODS if m in averages]
    if not methods_present:
        logger.warning("No average scores available — skipping Graph 1.")
        return

    precision_vals = [_safe_val(averages[m]["avg_precision"]) for m in methods_present]
    recall_vals    = [_safe_val(averages[m]["avg_recall"])    for m in methods_present]
    f1_vals        = [_safe_val(averages[m]["avg_f1"])        for m in methods_present]

    x      = np.arange(len(methods_present))
    width  = 0.25
    offset = [-width, 0, width]

    fig, ax = plt.subplots(figsize=(10, 6))

    bars_p = ax.bar(x + offset[0], precision_vals, width,
                    label="Precision", color=COLORS["Precision"],
                    edgecolor="white", linewidth=0.8)
    bars_r = ax.bar(x + offset[1], recall_vals, width,
                    label="Recall", color=COLORS["Recall"],
                    edgecolor="white", linewidth=0.8)
    bars_f = ax.bar(x + offset[2], f1_vals, width,
                    label="F1-score", color=COLORS["F1-score"],
                    edgecolor="white", linewidth=0.8)

    # Value labels on top of each bar
    for bars in [bars_p, bars_r, bars_f]:
        for bar in bars:
            h = bar.get_height()
            if h > 0:
                ax.annotate(
                    f"{h:.3f}",
                    xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 3), textcoords="offset points",
                    ha="center", va="bottom", fontsize=8,
                )

    ax.set_xlabel("Keyword Extraction Method", fontsize=12, labelpad=10)
    ax.set_ylabel("Score", fontsize=12, labelpad=10)
    ax.set_title(
        "DPR Keyword Extraction — Precision, Recall & F1-score Comparison\n"
        "(Average across all DPR documents with ground truth)",
        fontsize=13, fontweight="bold", pad=15,
    )
    ax.set_xticks(x)
    ax.set_xticklabels(methods_present, fontsize=11)
    ax.set_ylim(0, 1.15)
    ax.yaxis.set_major_formatter(
        plt.FuncFormatter(lambda val, _: f"{val:.1f}")
    )
    ax.legend(fontsize=10, loc="upper right")
    ax.grid(axis="y", linestyle="--", alpha=0.5)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    plt.tight_layout()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info(f"Graph 1 saved: {output_path}")


def plot_f1_comparison(averages: dict, output_path: str) -> None:
    """
    Graph 2: Simple bar chart — Average F1-score per method.
    Best method highlighted in gold.
    """
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
    except ImportError:
        logger.error("matplotlib not installed.")
        return

    methods_present = [m for m in METHODS if m in averages]
    if not methods_present:
        logger.warning("No average scores available — skipping Graph 2.")
        return

    f1_vals = [_safe_val(averages[m]["avg_f1"]) for m in methods_present]

    # Identify best method
    best_idx = int(np.argmax(f1_vals)) if any(v > 0 for v in f1_vals) else -1
    bar_colors = [
        BEST_COLOR if i == best_idx else DEFAULT_COLOR
        for i in range(len(methods_present))
    ]

    fig, ax = plt.subplots(figsize=(8, 5))
    bars = ax.bar(methods_present, f1_vals, color=bar_colors,
                  edgecolor="white", linewidth=0.8, width=0.5)

    for bar, val in zip(bars, f1_vals):
        if val > 0:
            ax.annotate(
                f"{val:.4f}",
                xy=(bar.get_x() + bar.get_width() / 2, val),
                xytext=(0, 4), textcoords="offset points",
                ha="center", va="bottom", fontsize=11, fontweight="bold",
            )

    if best_idx >= 0:
        ax.annotate(
            "★ Best",
            xy=(best_idx, f1_vals[best_idx]),
            xytext=(0, 18), textcoords="offset points",
            ha="center", fontsize=10, color="#B8860B", fontweight="bold",
        )

    ax.set_xlabel("Keyword Extraction Method", fontsize=12, labelpad=10)
    ax.set_ylabel("Average F1-score", fontsize=12, labelpad=10)
    ax.set_title(
        "DPR Keyword Extraction — Average F1-score Comparison",
        fontsize=13, fontweight="bold", pad=15,
    )
    ax.set_ylim(0, min(1.15, max(f1_vals) * 1.4 + 0.1) if any(v > 0 for v in f1_vals) else 1.0)
    ax.grid(axis="y", linestyle="--", alpha=0.5)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    # Legend for colour meaning
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor=BEST_COLOR,    label="Best method"),
        Patch(facecolor=DEFAULT_COLOR, label="Other methods"),
    ]
    ax.legend(handles=legend_elements, fontsize=9, loc="upper right")

    plt.tight_layout()
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info(f"Graph 2 saved: {output_path}")


def generate_all_graphs(averages: dict) -> None:
    """Entry point — generate both graphs."""
    os.makedirs(GRAPHS_DIR, exist_ok=True)

    plot_grouped_bar(
        averages,
        os.path.join(GRAPHS_DIR, "precision_recall_f1_comparison.png"),
    )
    plot_f1_comparison(
        averages,
        os.path.join(GRAPHS_DIR, "f1_score_comparison.png"),
    )
