from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd
import re
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, confusion_matrix, recall_score

try:
    import shap
except ImportError:
    shap = None

def _encoded_column_to_original(encoded_col: str, orig_features: List[str]) -> str:
    if encoded_col in orig_features:
        return encoded_col
    for f in orig_features:
        prefix = f + "_"
        if encoded_col.startswith(prefix):
            return f
    return encoded_col

def _build_orig_column_map(encoded_cols: List[str], orig_features: List[str]) -> List[str]:
    return [_encoded_column_to_original(c, orig_features) for c in encoded_cols]

def _aggregate_rows_by_orig(values_per_encoded: np.ndarray, orig_per_col: List[str], orig_features: List[str]) -> np.ndarray:
    idx = {f: i for i, f in enumerate(orig_features)}
    out = np.zeros((values_per_encoded.shape[0], len(orig_features)))
    for j, ocol in enumerate(orig_per_col):
        if ocol not in idx:
            continue
        out[:, idx[ocol]] += values_per_encoded[:, j]
    return out

def _marginal_risk_contributions(model, X_test_np: np.ndarray, X_train_np: np.ndarray, pos_idx: int) -> np.ndarray:
    n_test, n_feat = X_test_np.shape
    med = np.median(X_train_np, axis=0)
    base = model.predict_proba(X_test_np)[:, pos_idx].astype(np.float64)
    out = np.zeros((n_test, n_feat), dtype=np.float64)
    for j in range(n_feat):
        Xm = X_test_np.copy()
        Xm[:, j] = med[j]
        out[:, j] = base - model.predict_proba(Xm)[:, pos_idx].astype(np.float64)
    return out

def _shap_matrix_or_marginal(model, m_type: str, X_train: pd.DataFrame, X_test: pd.DataFrame, pos_idx: int, X_train_np: np.ndarray, X_test_np: np.ndarray) -> np.ndarray:
    if shap is not None:
        try:
            if m_type in ("rf", "dt"):
                explainer = shap.TreeExplainer(model)
                sv = explainer.shap_values(X_test)
            elif m_type == "lr":
                explainer = shap.LinearExplainer(model, X_train)
                sv = explainer.shap_values(X_test)
            else:
                sv = None
            if sv is not None:
                if isinstance(sv, list):
                    sv = np.asarray(sv[pos_idx])
                else:
                    sv = np.asarray(sv)
                    if sv.ndim == 3:
                        sv = sv[:, :, pos_idx]
                return sv.astype(np.float64)
        except Exception:
            pass
    return _marginal_risk_contributions(model, X_test_np, X_train_np, pos_idx)

def build_explainability(model: Any, m_type: str, X_train: pd.DataFrame, X_test: pd.DataFrame, y_test: pd.Series, y_pred: np.ndarray, df_test_raw: pd.DataFrame, orig_features: List[str], cat_cols: List[str], pos_idx: int, pos_label: Any, max_test_rows: int = 36) -> Dict[str, Any]:
    """
    Build local and global explanations for model predictions.
    """
    encoded_cols = list(X_train.columns)
    orig_per_col = _build_orig_column_map(encoded_cols, orig_features)
    X_train_np = X_train.to_numpy(dtype=np.float64)
    X_test_np = X_test.to_numpy(dtype=np.float64)
    
    local_enc = _shap_matrix_or_marginal(model, m_type, X_train, X_test, pos_idx, X_train_np, X_test_np)
    local_enc = np.nan_to_num(local_enc, nan=0.0, posinf=0.0, neginf=0.0)
    local_orig = _aggregate_rows_by_orig(local_enc, orig_per_col, orig_features)
    
    glob_from_local = np.mean(np.abs(local_orig), axis=0)
    global_dict = {orig_features[i]: float(glob_from_local[i]) for i in range(len(orig_features))}
    
    # Global permutation importance for augmentation
    try:
        pi = permutation_importance(model, X_test, y_test, n_repeats=8, random_state=42, scoring="roc_auc")
        perm_agg: Dict[str, float] = {f: 0.0 for f in orig_features}
        for j, ocol in enumerate(orig_per_col):
            if ocol in perm_agg and j < len(pi.importances_mean):
                perm_agg[ocol] += max(0.0, float(pi.importances_mean[j]))
        
        if perm_agg:
            mx = max(global_dict.values()) if global_dict.values() else 1.0
            mx = mx if mx > 1e-12 else 1.0
            for f in orig_features:
                global_dict[f] = 0.6 * global_dict[f] + 0.4 * ((perm_agg.get(f, 0.0) / (max(perm_agg.values()) or 1.0)) * mx)
    except:
        pass

    fi_sorted = sorted([{"feature": f, "importance": float(global_dict.get(f, 0.0))} for f in orig_features], key=lambda x: x["importance"], reverse=True)
    
    n_take = min(max_test_rows, len(X_test))
    probs = model.predict_proba(X_test)[:n_take, pos_idx] if hasattr(model, "predict_proba") else np.zeros(n_take)
    
    test_explanations: List[Dict[str, Any]] = []
    for i in range(n_take):
        row_vals = local_orig[i]
        order = np.argsort(-np.abs(row_vals))
        top_k = order[: min(10, len(order))]
        contributions: List[Dict[str, Any]] = []
        for j in top_k:
            fname = orig_features[int(j)]
            impact = float(row_vals[int(j)])
            raw_v = df_test_raw.iloc[i][fname] if fname in df_test_raw.columns else None
            disp = raw_v if raw_v is not None and not (isinstance(raw_v, float) and np.isnan(raw_v)) else ""
            contributions.append({
                "feature": fname, 
                "value": disp, 
                "impact": impact, 
                "direction": "increase_risk" if impact >= 0 else "decrease_risk"
            })
        
        test_explanations.append({
            "patient_index": i + 1, 
            "prob_positive": round(float(probs[i]) * 100, 1), 
            "prob_positive_raw": float(probs[i]), 
            "actual_label": str(y_test.iloc[i]), 
            "predicted_label": str(y_pred[i]), 
            "contributions": contributions
        })
        
    return {"feature_importance": fi_sorted, "test_explanations": test_explanations, "positive_class": str(pos_label)}

def compute_fairness_subgroups(df_test: pd.DataFrame, y_test: pd.Series, y_pred: np.ndarray, pos_label: Any, labels: np.ndarray) -> Dict[str, Any]:
    """
    Analyze model performance across different demographic subgroups.
    """
    y_true_a = np.asarray(y_test.values)
    y_pred_a = np.asarray(y_pred).ravel()
    if len(y_true_a) != len(y_pred_a): 
        return {"subgroups": [], "sensitivity_max_gap_pp": 0.0, "bias_warning": False, "min_subgroup_n": 5}
    
    subgroups: List[Dict[str, Any]] = []
    
    # Sex/Gender Detection
    gcol = None
    for c in df_test.columns:
        cl = str(c).lower().strip()
        if "gender" in cl or cl == "sex" or cl.startswith("sex"):
            gcol = c
            break
            
    if gcol:
        uniq = pd.Series(df_test[gcol]).dropna().unique().tolist()
        for v in uniq[:8]:
            mask = pd.Series(df_test[gcol]).eq(v).to_numpy()
            if mask.sum() == 0: continue
            m = _get_subgroup_metrics(y_true_a[mask], y_pred_a[mask], pos_label, labels)
            if m:
                label = str(v).strip().lower()
                display = "Female" if label in ("f", "female", "woman", "1", "true") else "Male" if label in ("m", "male", "man", "0", "false") else str(v)[:48]
                subgroups.append({"label": f"Sex: {display}", "n": int(m["n"]), "accuracy": m["accuracy"], "sensitivity": m["sensitivity"], "specificity": m["specificity"]})

    # Age Detection
    acol = None
    cols = [str(c).lower() for c in df_test.columns]
    if "age_raw" in cols: acol = df_test.columns[cols.index("age_raw")]
    elif "age" in cols: acol = df_test.columns[cols.index("age")]
    
    if acol:
        def parse_age(val):
            try: return float(val) if val is not None and not (isinstance(val, float) and np.isnan(val)) else None
            except: return None
        
        ages = df_test[acol].map(parse_age)
        bucket_defs = [("Age 18–60", lambda a: a.notna() & (a >= 18) & (a <= 60)), ("Age 61–75", lambda a: a.notna() & (a >= 61) & (a <= 75)), ("Age 76+", lambda a: a.notna() & (a >= 76))]
        for bname, pred in bucket_defs:
            mask = np.asarray(pred(ages))
            if mask.sum() == 0: continue
            m = _get_subgroup_metrics(y_true_a[mask], y_pred_a[mask], pos_label, labels)
            if m: subgroups.append({"label": bname, "n": int(m["n"]), "accuracy": m["accuracy"], "sensitivity": m["sensitivity"], "specificity": m["specificity"]})

    valid = [s for s in subgroups if s["n"] >= 5]
    gap_pp, bias_warning = 0.0, False
    if len(valid) >= 2:
        sens_vals = [float(s["sensitivity"]) for s in valid]
        gap_pp = (max(sens_vals) - min(sens_vals)) * 100.0
        bias_warning = gap_pp > 10.0
        
    return {"subgroups": subgroups, "sensitivity_max_gap_pp": round(float(gap_pp), 1), "bias_warning": bias_warning, "min_subgroup_n": 5}

def _get_subgroup_metrics(y_true, y_pred, pos_label, labels):
    n = len(y_true)
    if n == 0: return None
    acc = float(accuracy_score(y_true, y_pred))
    if n < 2 or len(np.unique(np.concatenate([y_true, y_pred]))) < 2:
        return {"n": n, "accuracy": acc, "sensitivity": 0.0, "specificity": 0.0}
    try:
        cm = confusion_matrix(y_true, y_pred, labels=labels)
        if cm.shape == (2, 2):
            lbl_arr = np.asarray(labels).ravel()
            pos_i = next((i for i, lb in enumerate(lbl_arr) if str(lb) == str(pos_label)), 0)
            neg_i = 1 - pos_i
            tp, fn, fp, tn = float(cm[pos_i, pos_i]), float(cm[pos_i, neg_i]), float(cm[neg_i, pos_i]), float(cm[neg_i, neg_i])
            sens = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        else:
            sens = float(recall_score(y_true, y_pred, pos_label=pos_label, zero_division=0))
            spec = 0.0
    except:
        sens = 0.0
        spec = 0.0
    return {"n": n, "accuracy": acc, "sensitivity": sens, "specificity": spec}
