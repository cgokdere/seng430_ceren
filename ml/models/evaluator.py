from typing import List, Dict, Any, Tuple, Optional
import pandas as pd
import numpy as np
from sklearn.metrics import accuracy_score, recall_score, roc_auc_score, precision_score, f1_score, roc_curve, confusion_matrix
from sklearn.model_selection import cross_val_score

def calculate_metrics(model: Any, X_train: pd.DataFrame, y_train: pd.Series, X_test: pd.DataFrame, y_test: pd.Series, y_pred: np.ndarray) -> Dict[str, Any]:
    """
    Calculate comprehensive performance metrics.
    """
    y_train_pred = model.predict(X_train)
    train_acc = float(accuracy_score(y_train, y_train_pred))
    test_acc = float(accuracy_score(y_test, y_pred))
    
    # Cross-validation
    cv_folds = 3 if len(X_train) < 100 else 5
    cv_scores = cross_val_score(model, X_train, y_train, cv=cv_folds)
    cv_mean = float(np.mean(cv_scores))
    cv_std = float(np.std(cv_scores))

    labels = np.unique(y_test)
    sens = spec = prec = f1 = auc_val = 0.0
    tn = fp = fn = tp = 0
    roc_points = []
    pos_label_final = None

    if len(labels) >= 2:
        # Positive label detection
        pos_label = labels[1]
        for lbl in labels:
            if str(lbl).lower().strip() in ['1', '1.0', 'yes', 'true', 'positive', 'malignant', 'pathological', 'abnormal']:
                pos_label = lbl
                break
        pos_label_final = pos_label
        
        sens = float(recall_score(y_test, y_pred, pos_label=pos_label, zero_division=0))
        prec = float(precision_score(y_test, y_pred, pos_label=pos_label, zero_division=0))
        f1 = float(f1_score(y_test, y_pred, pos_label=pos_label, zero_division=0))
        
        cm = confusion_matrix(y_test, y_pred, labels=labels)
        if cm.shape == (2, 2):
            tn_val, fp_val, fn_val, tp_val = cm.ravel()
            tn, fp, fn, tp = int(tn_val), int(fp_val), int(fn_val), int(tp_val)
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        
        if hasattr(model, "predict_proba"):
            y_prob = model.predict_proba(X_test)
            if pos_label in model.classes_:
                pos_idx = list(model.classes_).index(pos_label)
                try:
                    auc_val = float(roc_auc_score(y_test, y_prob[:, pos_idx]))
                    if np.isnan(auc_val): auc_val = 0.0
                    fpr, tpr, _ = roc_curve(y_test, y_prob[:, pos_idx], pos_label=pos_label)
                    # Downsample for frontend
                    if len(fpr) > 100:
                        indices = np.linspace(0, len(fpr)-1, 100, dtype=int)
                        fpr, tpr = fpr[indices], tpr[indices]
                    roc_points = [{"x": float(f), "y": float(t)} for f, t in zip(fpr, tpr)]
                except:
                    auc_val = 0.0

    return {
        "train_accuracy": train_acc,
        "test_accuracy": test_acc,
        "cv_mean": cv_mean,
        "cv_std": cv_std,
        "sensitivity": sens,
        "specificity": spec,
        "precision": prec,
        "f1_score": f1,
        "auc": auc_val,
        "confusion_matrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        "roc_points": roc_points,
        "positive_label": pos_label_final,
        "labels": labels.tolist()
    }

def diagnose_overfit(metrics: Dict[str, Any], y_test: pd.Series) -> Tuple[bool, bool, str]:
    """
    Diagnose overfitting or data leakage based on metrics.
    """
    train_acc = metrics["train_accuracy"]
    test_acc = metrics["test_accuracy"]
    spec = metrics["specificity"]
    prec = metrics["precision"]
    auc = metrics["auc"]
    cv_std = metrics["cv_std"]

    overfit_suspected = (train_acc - test_acc) > 0.10
    perfect_score = (spec >= 0.99 or prec >= 0.99 or auc >= 0.97)
    
    reasons = []
    if perfect_score:
        perf_details = []
        if spec >= 0.99: perf_details.append(f"Specificity: {spec*100:.0f}%")
        if prec >= 0.99: perf_details.append(f"Precision: {prec*100:.0f}%")
        if auc >= 0.97: perf_details.append(f"AUC: {auc:.2f}")
        
        reasons.append(
            f"Perfect scores detected ({', '.join(perf_details)}). "
            "This is statistically unlikely in real clinical data and may indicate data leakage."
        )
    elif overfit_suspected:
        reasons.append(f"High gap between training ({train_acc*100:.0f}%) and testing ({test_acc*100:.0f}%) accuracy.")
        
    if cv_std > 0.15:
        reasons.append(f"High variance in cross-validation (std: {cv_std:.2f}), suggesting instability.")
        
    if len(y_test) < 30:
        reasons.append(f"Warning: Test set has only {len(y_test)} samples. Results on small test sets are unreliable.")
        
    overfit_reason = " ".join(reasons) if reasons else "Model performance looks normal."
    
    return overfit_suspected, perfect_score, overfit_reason
