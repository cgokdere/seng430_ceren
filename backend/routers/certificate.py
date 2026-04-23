from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import io
import re
from fpdf import FPDF

router = APIRouter(prefix="/api", tags=["certificate"])


class ChecklistItem(BaseModel):
    text: str
    checked: bool


class ModelResult(BaseModel):
    name: str
    accuracy: str
    sensitivity: str
    specificity: str
    precision: Optional[str] = "N/A"
    f1: Optional[str] = "N/A"
    auc: Optional[str] = "N/A"
    tp: Optional[int] = 0
    fp: Optional[int] = 0
    tn: Optional[int] = 0
    fn: Optional[int] = 0

class SubgroupPerf(BaseModel):
    group: str
    accuracy: str
    sensitivity: str
    specificity: str
    fairness: str


class CertRequest(BaseModel):
    domain: str
    checklist_total: int
    checklist_checked: int
    checklist_items: List[ChecklistItem] = []
    models: List[ModelResult] = []
    bias_findings: Optional[str] = ""
    subgroup_performance: Optional[List[SubgroupPerf]] = []
    feature_importance: Optional[List[str]] = []


def _safe(text: str) -> str:
    """Remove non-latin1 characters fpdf can't encode."""
    if not text:
        return ""
    text = str(text)
    text = text.replace("—", "-").replace("⚠", "!").replace("❌", "X").replace("✓", "V")
    return "".join(c if ord(c) < 256 else "?" for c in text)


@router.post("/generate-certificate")
def generate_certificate(req: CertRequest):
    pdf = FPDF()
    pdf.set_margins(15, 15, 15)
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # ── Header ────────────────────────────────────────────────────────
    pdf.set_fill_color(9, 14, 20)          # dark navy
    pdf.rect(0, 0, 210, 40, "F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_xy(15, 8)
    pdf.cell(0, 12, "HEALTH-AI  |  Clinical ML Summary", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_xy(15, 22)
    pdf.cell(0, 8, _safe(f"Clinical Domain: {req.domain}"), ln=True)
    pdf.set_text_color(0, 0, 0)

    pdf.ln(8)

    # ── Ethics Checklist ──────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_fill_color(125, 140, 58)       # olive
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 8, " EU AI Act Ethics Checklist", ln=True, fill=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    pdf.set_font("Helvetica", "", 10)
    score_pct = int(req.checklist_checked / max(req.checklist_total, 1) * 100)
    pdf.cell(0, 6, _safe(f"Completed: {req.checklist_checked} / {req.checklist_total}  ({score_pct}%)"), ln=True)
    pdf.ln(1)

    checklist_text = ""
    for item in req.checklist_items:
        tick = "[x]" if item.checked else "[ ]"
        checklist_text += f"{tick}  {item.text}\n"
    
    w = pdf.w - pdf.l_margin - pdf.r_margin
    pdf.multi_cell(w, 6, _safe(checklist_text.strip()))
    pdf.ln(4)

    # ── Model Comparison ──────────────────────────────────────────────
    if req.models:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_fill_color(125, 140, 58)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, " Model Comparison Results", ln=True, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)

        # Calculate proportional column widths
        base_widths = [60, 25, 30, 30, 25, 20, 20]
        total_base = sum(base_widths)
        w = pdf.w - pdf.l_margin - pdf.r_margin
        col_w = [bw * (w / total_base) for bw in base_widths]

        headers = ["Model", "Accuracy", "Sensitivity", "Specificity", "Precision", "F1", "AUC"]
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 230)
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 7, h, border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for m in req.models:
            row = [m.name, m.accuracy, m.sensitivity, m.specificity,
                   m.precision or "N/A", m.f1 or "N/A", m.auc or "N/A"]
            for i, val in enumerate(row):
                pdf.cell(col_w[i], 6, _safe(val), border=1)
            pdf.ln()
        pdf.ln(4)

        # -- Confusion Matrix Summary --
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 6, "Confusion Matrix Summary & Clinical Impact", ln=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_fill_color(245, 245, 245)
        for m in req.models:
            pdf.set_font("Helvetica", "B", 9)
            y0 = pdf.get_y()
            pdf.cell(60, 10, _safe(m.name), border=1, fill=True)
            pdf.set_font("Helvetica", "", 9)
            cm_text = f"TP: {m.tp} | TN: {m.tn} | FP: {m.fp} | FN: {m.fn}"
            pdf.cell(45, 10, _safe(cm_text), border=1)
            x_end = pdf.get_x()
            w_remain = pdf.w - pdf.l_margin - pdf.r_margin - 105
            
            pdf.set_text_color(200, 0, 0) if m.fn > 0 else pdf.set_text_color(0, 150, 0)
            
            # Draw the outer cell border
            pdf.set_xy(x_end, y0)
            pdf.cell(w_remain, 10, "", border=1)
            
            # Draw the text lines inside
            pdf.set_xy(x_end + 2, y0 + 1)
            pdf.cell(w_remain - 2, 4, "Missed Cases (Sent Home Incorrectly):", border=0, align="L")
            pdf.set_xy(x_end + 2, y0 + 5)
            pdf.cell(w_remain - 2, 4, f"{m.fn} patients", border=0, align="L")
            
            pdf.set_text_color(0, 0, 0)
            pdf.set_xy(pdf.l_margin, y0 + 10)
        pdf.ln(4)

    # -- Feature Importance --
    if req.feature_importance:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_fill_color(125, 140, 58)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, " Feature Importance / Explainability", ln=True, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(0, 6, "Top 5 most influential clinical features driving the model's predictions:", ln=True)
        pdf.ln(1)
        for idx, feat in enumerate(req.feature_importance):
            pdf.cell(10, 6, f"{idx+1}.", align="R")
            pdf.cell(0, 6, _safe(feat), ln=True)
        pdf.ln(4)

    # -- Subgroup Performance Table --
    if req.subgroup_performance:
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_fill_color(125, 140, 58)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, " Subgroup Performance - Model Fairness", ln=True, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)

        sg_base_widths = [45, 30, 30, 30, 45]
        sg_total_base = sum(sg_base_widths)
        w = pdf.w - pdf.l_margin - pdf.r_margin
        sg_col_w = [bw * (w / sg_total_base) for bw in sg_base_widths]

        sg_headers = ["Patient Group", "Accuracy", "Sensitivity", "Specificity", "Fairness"]
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 230)
        for i, h in enumerate(sg_headers):
            pdf.cell(sg_col_w[i], 7, h, border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for sg in req.subgroup_performance:
            row = [sg.group, sg.accuracy, sg.sensitivity, sg.specificity, sg.fairness]
            for i, val in enumerate(row):
                pdf.cell(sg_col_w[i], 6, _safe(val), border=1)
            pdf.ln()
        pdf.ln(4)

    # ── Bias / Fairness Findings ──────────────────────────────────────
    if req.bias_findings and req.bias_findings.strip():
        pdf.set_font("Helvetica", "B", 13)
        pdf.set_fill_color(125, 140, 58)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 8, " Fairness & Bias Findings", ln=True, fill=True)
        pdf.set_text_color(0, 0, 0)
        pdf.ln(2)
        pdf.set_font("Helvetica", "", 10)
        w = pdf.w - pdf.l_margin - pdf.r_margin
        clean_bias = re.sub(r'\s+', ' ', req.bias_findings or "").strip()
        pdf.multi_cell(w, 6, _safe(clean_bias))
        pdf.ln(4)

    # ── Recommended Next Steps ────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_fill_color(125, 140, 58)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(0, 8, " Recommended Next Steps Prior to Deployment", ln=True, fill=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 10)
    
    steps = [
        "1. Address Subgroup Bias: Retrain the model using a more balanced dataset that adequately represents all demographic groups (especially those highlighted with 'Review Needed').",
        "2. Clinical Validation: Conduct a prospective silent trial where the model runs in the background of a real clinical setting without influencing decisions, comparing its predictions to actual clinician outcomes.",
        "3. Human Oversight Integration: Finalize the clinical workflow to ensure all high-risk flags are manually reviewed by a qualified clinician before any action is taken.",
        "4. Model Drift Monitoring: Establish a protocol to monitor and re-evaluate the model's accuracy every 3 to 6 months to account for changes in patient population or clinical guidelines.",
        "5. Incident Pathway: Define and document a clear incident reporting pathway for clinical staff to report potential errors or harms caused by the model's recommendations."
    ]
    
    w = pdf.w - pdf.l_margin - pdf.r_margin
    for step in steps:
        pdf.multi_cell(w, 6, _safe(step))
        pdf.ln(1)
    pdf.ln(4)

    # ── Footer ────────────────────────────────────────────────────────
    pdf.set_y(-20)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(120, 120, 120)
    pdf.cell(0, 6,
             "Generated by HEALTH-AI Clinical ML Learning Platform  |  Erasmus+ KA220-HED  |  For educational use only",
             align="C")

    # ── Stream PDF bytes ──────────────────────────────────────────────
    buf = io.BytesIO(pdf.output())
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=HealthAI-Summary-Certificate.pdf"},
    )
