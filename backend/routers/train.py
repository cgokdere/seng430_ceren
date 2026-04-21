from fastapi import APIRouter, HTTPException
import pandas as pd
import numpy as np
import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

# Import from ml package
try:
    from ml.models.trainer import create_model, train_model
    from ml.models.evaluator import calculate_metrics, diagnose_overfit
    from ml.models.explainer import build_explainability, compute_fairness_subgroups
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from ml.models.trainer import create_model, train_model
    from ml.models.evaluator import calculate_metrics, diagnose_overfit
    from ml.models.explainer import build_explainability, compute_fairness_subgroups

try:
    from utils import clean_nans
    from store import results_db
except ImportError:
    from ..utils import clean_nans
    from ..store import results_db

router = APIRouter(prefix="/api", tags=["training"])

class TrainingRequest(BaseModel):
    trainRows: List[Dict[str, Any]]
    testRows: List[Dict[str, Any]]
    features: List[str]
    targetColumn: str
    modelType: str
    params: Dict[str, Any]

@router.post("/train")
async def train_model_endpoint(req: TrainingRequest):
    try:
        df_train = pd.DataFrame(req.trainRows)
        df_test = pd.DataFrame(req.testRows)
        
        if df_train.empty or df_test.empty:
            raise HTTPException(status_code=400, detail="Training or testing data is empty")
            
        X_train = df_train[req.features]
        y_train = df_train[req.targetColumn]
        X_test = df_test[req.features]
        y_test = df_test[req.targetColumn]
        
        # One-Hot Encode categorical (string) features
        cat_cols = X_train.select_dtypes(include=['object', 'category']).columns.tolist()
        if cat_cols:
            n_train = len(X_train)
            X_combined = pd.concat([X_train, X_test], axis=0)
            X_combined = pd.get_dummies(X_combined, columns=cat_cols, drop_first=True)
            X_train = X_combined.iloc[:n_train].copy()
            X_test = X_combined.iloc[n_train:].copy()
        
        # 1. Create and Train Model (ML calling)
        model, model_display_name = create_model(req.modelType, req.params)
        model.fit(X_train, y_train)
        
        # 2. Evaluate Performance (ML calling)
        y_pred = model.predict(X_test)
        metrics = calculate_metrics(model, X_train, y_train, X_test, y_test, y_pred)
        
        # 3. Diagnose Overfitting/Perfect Score (ML calling)
        overfit_suspected, perfect_score, overfit_reason = diagnose_overfit(metrics, y_test)
        
        # 4. Explainability & Fairness (ML calling)
        labels = np.array(metrics["labels"])
        pos_label = metrics["positive_label"]
        pos_idx = None
        if pos_label in model.classes_:
            pos_idx = list(model.classes_).index(pos_label)
            
        explain_payload = {}
        if pos_idx is not None:
            try:
                explain_payload = build_explainability(
                    model, req.modelType, X_train, X_test, y_test, y_pred, 
                    pd.DataFrame(req.testRows), req.features, cat_cols, 
                    pos_idx, pos_label
                )
            except: pass

        fairness_payload = {}
        try:
            fairness_payload = compute_fairness_subgroups(
                pd.DataFrame(req.testRows), y_test, y_pred, pos_label, labels
            )
        except: pass

        # 5. Build Final Response
        cm = metrics["confusion_matrix"]
        result = {
            "ok": True,
            "model_id": req.modelType,
            "model_name_display": model_display_name,
            "accuracy": f"{int(round(metrics['test_accuracy'] * 100))}%",
            "train_accuracy": f"{int(round(metrics['train_accuracy'] * 100))}%",
            "sensitivity": f"{int(round(metrics['sensitivity'] * 100))}%",
            "specificity": f"{int(round(metrics['specificity'] * 100))}%",
            "precision": f"{int(round(metrics['precision'] * 100))}%",
            "f1_score": f"{int(round(metrics['f1_score'] * 100))}%",
            "auc": round(float(metrics['auc']), 2),
            "tn": int(cm['tn']),
            "fp": int(cm['fp']),
            "fn": int(cm['fn']),
            "tp": int(cm['tp']),
            "roc_points": metrics['roc_points'],
            "feature_importance": explain_payload.get("feature_importance", []),
            "test_explanations": explain_payload.get("test_explanations", []),
            "positive_class": str(pos_label),
            "fairness": fairness_payload,
            "overfit_suspected": bool(overfit_suspected),
            "perfect_score": bool(perfect_score),
            "cv_mean": round(metrics['cv_mean'], 4),
            "cv_std": round(metrics['cv_std'], 4),
            "overfit_reason": overfit_reason
        }
        
        result = clean_nans(result)
        
        # Save to result store
        res_id = str(uuid.uuid4())
        results_db[res_id] = result
        result["result_id"] = res_id
        
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
