from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class PreparationSettings(BaseModel):
    missingValueStrategy: str  # 'median', 'mode', 'drop'
    normalisation: str         # 'zscore', 'minmax', 'none'
    smote: bool
    classWeights: bool = False
    testSize: float
    removeOutliers: bool = False

class OutlierRequest(BaseModel):
    rawRows: List[Dict[str, Any]]
    columns: List[Dict[str, Any]]

class PrepareRequest(BaseModel):
    rawRows: List[Dict[str, Any]]
    columns: List[Dict[str, Any]]
    targetColumn: str
    settings: PreparationSettings

class ChecklistItem(BaseModel):
    text: str
    checked: bool

class ModelMetrics(BaseModel):
    name: str
    accuracy: str
    sensitivity: str
    specificity: str
    precision: str
    f1: str
    auc: str
    npv: Optional[str] = None

class CertificateRequest(BaseModel):
    domain: str
    checklist_total: int
    checklist_checked: int
    checklist_items: List[ChecklistItem]
    models: List[ModelMetrics]
    bias_findings: str
