from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel
from datetime import datetime
import os
import re
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from imblearn.over_sampling import SMOTE
from typing import List, Dict, Any, Optional, Tuple
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import GaussianNB
from sklearn.metrics import accuracy_score, recall_score, roc_auc_score, confusion_matrix, precision_score, f1_score, roc_curve
from sklearn.inspection import permutation_importance

try:
    import shap
except ImportError:
    shap = None  # type: ignore

app = FastAPI(title="Health-AI Data Preparation API")

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/api/docs")

@app.get("/health", include_in_schema=False)
def health():
    return {"ok": True}

def _load_allowed_origins() -> list[str]:
    """
    Comma-separated origins via FRONTEND_ORIGINS.
    Example: "https://my-frontend.com,https://www.my-frontend.com"
    """
    raw = os.getenv("FRONTEND_ORIGINS", "").strip()
    if raw:
        return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    # Local dev: http.server 8080, VS Code Live Server 5500, etc.
    return [
        "https://healthai-juniorengineers-2.onrender.com",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5501",
    ]

app.add_middleware(
    CORSMiddleware,
    # With allow_credentials=True, "*" is not valid. Provide explicit frontend origin(s).
    allow_origins=_load_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PreparationSettings(BaseModel):
    missingValueStrategy: str  # 'median', 'mode', 'drop'
    normalisation: str         # 'zscore', 'minmax', 'none'
    smote: bool
    classWeights: bool = False
    testSize: float

class PrepareRequest(BaseModel):
    rawRows: List[Dict[str, Any]]
    columns: List[Dict[str, Any]]
    targetColumn: str
    settings: PreparationSettings

class TrainingRequest(BaseModel):
    trainRows: List[Dict[str, Any]]
    testRows: List[Dict[str, Any]]
    features: List[str]
    targetColumn: str
    modelType: str
    params: Dict[str, Any]


def _encoded_column_to_original(encoded_col: str, orig_features: List[str], cat_cols: List[str]) -> str:
    """Maps one-hot / numeric column name back to a logical feature from preparation."""
    if encoded_col in orig_features:
        return encoded_col
    cat_set = set(cat_cols)
    for f in orig_features:
        prefix = f + "_"
        if encoded_col.startswith(prefix):
            return f
    for f in orig_features:
        if encoded_col.startswith(f + "_"):
            return f
    return encoded_col


def _build_orig_column_map(encoded_cols: List[str], orig_features: List[str], cat_cols: List[str]) -> List[str]:
    return [_encoded_column_to_original(c, orig_features, cat_cols) for c in encoded_cols]


def _aggregate_rows_by_orig(
    values_per_encoded: np.ndarray,
    orig_per_col: List[str],
    orig_features: List[str],
) -> np.ndarray:
    """Sum columns that belong to the same original feature (e.g. one-hot groups)."""
    idx = {f: i for i, f in enumerate(orig_features)}
    out = np.zeros((values_per_encoded.shape[0], len(orig_features)))
    for j, ocol in enumerate(orig_per_col):
        if ocol not in idx:
            continue
        out[:, idx[ocol]] += values_per_encoded[:, j]
    return out


def _marginal_risk_contributions(
    model,
    X_test_np: np.ndarray,
    X_train_np: np.ndarray,
    pos_idx: int,
) -> np.ndarray:
    """
    Per encoded column: (p(x) - p(x with feature j replaced by train median)).
    Positive => this feature's observed value increases positive-class probability vs median reference.
    """
    n_test, n_feat = X_test_np.shape
    med = np.median(X_train_np, axis=0)
    base = model.predict_proba(X_test_np)[:, pos_idx].astype(np.float64)
    out = np.zeros((n_test, n_feat), dtype=np.float64)
    for j in range(n_feat):
        Xm = X_test_np.copy()
        Xm[:, j] = med[j]
        out[:, j] = base - model.predict_proba(Xm)[:, pos_idx].astype(np.float64)
    return out


def _shap_matrix_or_marginal(
    model,
    m_type: str,
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    pos_idx: int,
    X_train_np: np.ndarray,
    X_test_np: np.ndarray,
) -> np.ndarray:
    """SHAP for tree / linear; otherwise marginal effect vs median (aligned with model predictions)."""
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


def _global_importance_permutation(
    model,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    orig_per_col: List[str],
    orig_features: List[str],
) -> Dict[str, float]:
    """Model-agnostic global importance; aggregated to original feature names."""
    try:
        pi = permutation_importance(
            model,
            X_test,
            y_test,
            n_repeats=8,
            random_state=42,
            scoring="roc_auc",
        )
        imp_enc = np.asarray(pi.importances_mean)
    except Exception:
        return {}
    agg: Dict[str, float] = {f: 0.0 for f in orig_features}
    for j, ocol in enumerate(orig_per_col):
        if ocol in agg and j < len(imp_enc):
            agg[ocol] += max(0.0, float(imp_enc[j]))
    return agg


def _build_explainability(
    model,
    m_type: str,
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
    y_test: pd.Series,
    y_pred: np.ndarray,
    df_test_raw: pd.DataFrame,
    orig_features: List[str],
    cat_cols: List[str],
    pos_idx: int,
    pos_label: Any,
    max_test_rows: int = 36,
) -> Dict[str, Any]:
    encoded_cols = list(X_train.columns)
    orig_per_col = _build_orig_column_map(encoded_cols, orig_features, cat_cols)
    X_train_np = X_train.to_numpy(dtype=np.float64)
    X_test_np = X_test.to_numpy(dtype=np.float64)

    local_enc = _shap_matrix_or_marginal(
        model, m_type, X_train, X_test, pos_idx, X_train_np, X_test_np
    )
    local_enc = np.nan_to_num(local_enc, nan=0.0, posinf=0.0, neginf=0.0)
    local_orig = _aggregate_rows_by_orig(local_enc, orig_per_col, orig_features)

    glob_from_local = np.mean(np.abs(local_orig), axis=0)
    global_dict = {orig_features[i]: float(glob_from_local[i]) for i in range(len(orig_features))}
    perm_agg = _global_importance_permutation(model, X_test, y_test, orig_per_col, orig_features)
    if perm_agg:
        mx = max(global_dict.values()) if global_dict.values() else 1.0
        mx = mx if mx > 1e-12 else 1.0
        for f in orig_features:
            global_dict[f] = 0.6 * global_dict[f] + 0.4 * ((perm_agg.get(f, 0.0) / (max(perm_agg.values()) or 1.0)) * mx)

    fi_sorted = sorted(
        [{"feature": f, "importance": float(global_dict.get(f, 0.0))} for f in orig_features],
        key=lambda x: x["importance"],
        reverse=True,
    )

    n_test = len(X_test)
    n_take = min(max_test_rows, n_test)
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X_test)[:n_take, pos_idx]
    else:
        probs = np.zeros(n_take)

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
            if raw_v is not None and not (isinstance(raw_v, float) and np.isnan(raw_v)):
                disp = raw_v
            else:
                disp = ""
            direction = "increase_risk" if impact >= 0 else "decrease_risk"
            contributions.append(
                {
                    "feature": fname,
                    "value": disp,
                    "impact": impact,
                    "direction": direction,
                }
            )
        pl = float(probs[i])
        test_explanations.append(
            {
                "patient_index": i + 1,
                "prob_positive": round(pl * 100, 1),
                "prob_positive_raw": pl,
                "actual_label": str(y_test.iloc[i]),
                "predicted_label": str(y_pred[i]),
                "contributions": contributions,
            }
        )

    return {
        "feature_importance": fi_sorted,
        "test_explanations": test_explanations,
        "positive_class": str(pos_label),
    }


def _detect_gender_column_fairness(df: pd.DataFrame) -> Optional[str]:
    for c in df.columns:
        cl = str(c).lower().strip()
        if "gender" in cl or cl == "sex" or cl.startswith("sex"):
            return c
    return None


def _detect_age_column_fairness(df: pd.DataFrame) -> Optional[str]:
    """Pre-scaled years (Age_raw) when Age was a normalized model feature; else raw Age."""
    cols = list(df.columns)
    for c in cols:
        if _norm_col_name(str(c)).lower() == "age_raw":
            return c
    for c in cols:
        cl = str(c).lower()
        if cl.endswith("_raw"):
            base = re.sub(r"_raw$", "", str(c), flags=re.IGNORECASE)
            if _is_demographic_fairness_col(base):
                return c
    for c in cols:
        if _norm_col_name(str(c)).lower() == "age":
            return c
    for c in cols:
        cl = _norm_col_name(str(c)).lower()
        if cl in ("patient_age", "age_years", "age_year"):
            return c
        if re.match(r"^age_\w+$", cl) or re.match(r"^\w+_age$", cl):
            if "image" in cl or "band" in cl:
                continue
            return c
    return None


def _parse_age_val(val: Any) -> Optional[float]:
    try:
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return None
        return float(val)
    except (TypeError, ValueError):
        return None


def _gender_display_label(val: Any) -> str:
    s = str(val).strip().lower()
    if s in ("f", "female", "woman", "1", "true"):
        return "Female"
    if s in ("m", "male", "man", "0", "false"):
        return "Male"
    return str(val).strip()[:48]


def _subgroup_metrics_cm(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    pos_label: Any,
    labels: np.ndarray,
) -> Optional[Dict[str, float]]:
    n = len(y_true)
    if n == 0:
        return None
    acc = float(accuracy_score(y_true, y_pred))
    if n < 2:
        return {"n": n, "accuracy": acc, "sensitivity": 0.0, "specificity": 0.0}
    ul = np.unique(np.concatenate([y_true, y_pred]))
    if len(ul) < 2:
        return {"n": n, "accuracy": acc, "sensitivity": 0.0, "specificity": 0.0}
    try:
        cm = confusion_matrix(y_true, y_pred, labels=labels)
        if cm.shape == (2, 2):
            lbl_arr = np.asarray(labels).ravel()
            pos_i = 0
            for i, lb in enumerate(lbl_arr):
                if lb == pos_label or str(lb) == str(pos_label):
                    pos_i = i
                    break
            neg_i = 1 - pos_i
            tp = float(cm[pos_i, pos_i])
            fn = float(cm[pos_i, neg_i])
            fp = float(cm[neg_i, pos_i])
            tn = float(cm[neg_i, neg_i])
            sens = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            spec = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        else:
            sens = float(recall_score(y_true, y_pred, pos_label=pos_label, zero_division=0))
            spec = 0.0
    except Exception:
        sens = float(recall_score(y_true, y_pred, pos_label=pos_label, zero_division=0))
        spec = 0.0
    return {"n": n, "accuracy": acc, "sensitivity": sens, "specificity": spec}


def _compute_fairness_subgroups(
    df_test: pd.DataFrame,
    y_test: pd.Series,
    y_pred: np.ndarray,
    pos_label: Any,
    labels: np.ndarray,
) -> Dict[str, Any]:
    """
    Test-set subgroup metrics (gender levels + age buckets) using the same predictions as overall test evaluation.
    """
    y_true_a = np.asarray(y_test.values)
    y_pred_a = np.asarray(y_pred).ravel()
    if len(y_true_a) != len(y_pred_a):
        return {"subgroups": [], "sensitivity_max_gap_pp": 0.0, "bias_warning": False, "min_subgroup_n": 5}

    subgroups: List[Dict[str, Any]] = []

    gcol = _detect_gender_column_fairness(df_test)
    if gcol and gcol in df_test.columns:
        uniq = pd.Series(df_test[gcol]).dropna().unique().tolist()
        if len(uniq) > 8:
            uniq = uniq[:8]
        for v in uniq:
            mask = pd.Series(df_test[gcol]).eq(v).to_numpy()
            if mask.sum() == 0:
                continue
            m = _subgroup_metrics_cm(y_true_a[mask], y_pred_a[mask], pos_label, labels)
            if m is None:
                continue
            subgroups.append(
                {
                    "label": f"Sex: {_gender_display_label(v)}",
                    "n": int(m["n"]),
                    "accuracy": m["accuracy"],
                    "sensitivity": m["sensitivity"],
                    "specificity": m["specificity"],
                }
            )

    acol = _detect_age_column_fairness(df_test)
    if acol and acol in df_test.columns:
        ages = df_test[acol].map(_parse_age_val)
        bucket_defs = [
            ("Age 18–60", lambda a: a.notna() & (a >= 18) & (a <= 60)),
            ("Age 61–75", lambda a: a.notna() & (a >= 61) & (a <= 75)),
            ("Age 76+", lambda a: a.notna() & (a >= 76)),
        ]
        for bname, pred in bucket_defs:
            mask = np.asarray(pred(ages))
            if mask.sum() == 0:
                continue
            m = _subgroup_metrics_cm(y_true_a[mask], y_pred_a[mask], pos_label, labels)
            if m is None:
                continue
            subgroups.append(
                {
                    "label": bname,
                    "n": int(m["n"]),
                    "accuracy": m["accuracy"],
                    "sensitivity": m["sensitivity"],
                    "specificity": m["specificity"],
                }
            )

    min_n = 5
    valid = [s for s in subgroups if s["n"] >= min_n]
    gap_pp = 0.0
    bias_warning = False
    if len(valid) >= 2:
        sens_vals = [float(s["sensitivity"]) for s in valid]
        gap_pp = (max(sens_vals) - min(sens_vals)) * 100.0
        bias_warning = gap_pp > 10.0 + 1e-9

    return {
        "subgroups": subgroups,
        "sensitivity_max_gap_pp": round(float(gap_pp), 1),
        "bias_warning": bias_warning,
        "min_subgroup_n": min_n,
    }


def get_stats(df, col_name, col_type):
    if col_type == 'numeric' and col_name in df.columns:
        series = pd.to_numeric(df[col_name], errors='coerce')
        valid_data = series.dropna()
        if len(valid_data) == 0:
            return None
        return {
            "min": float(valid_data.min()),
            "max": float(valid_data.max()),
            "mean": float(valid_data.mean())
        }
    return None

def get_aggregate_numeric_stats(df: pd.DataFrame, numeric_cols: List[str]):
    """
    Compute global min/max/mean across ALL numeric feature values (all rows, all numeric columns).
    This matches the UI requirement: use dataset-wide extrema and overall average, not a single example column.
    """
    if df is None or df.empty or not numeric_cols:
        return None
    cols = [c for c in numeric_cols if c in df.columns]
    if not cols:
        return None
    # Coerce to numeric and flatten across columns.
    m = df[cols].apply(pd.to_numeric, errors='coerce')
    vals = m.to_numpy().astype(np.float64).ravel()
    vals = vals[~np.isnan(vals)]
    if vals.size == 0:
        return None
    return {
        "min": float(np.min(vals)),
        "max": float(np.max(vals)),
        "mean": float(np.mean(vals)),
    }

def get_class_balance(df, target_col):
    if target_col not in df.columns:
        return {}
    counts = df[target_col].value_counts(dropna=True)
    total = len(df[target_col].dropna())
    if total == 0:
        return {}
    return {str(k): {"count": int(v), "pct": round((int(v) / total) * 100, 1)} for k, v in counts.items()}

def safe_json_serialize(df: pd.DataFrame) -> pd.DataFrame:
    """
    NaN'ları None'a (JSON null) çevirir — "None" string'ine değil.
    Sonraki adımlarda tip karışıklığını önler.
    """
    return df.where(pd.notnull(df), other=None)

def _norm_col_name(name: Any) -> str:
    """CSV BOM / whitespace — frontend ile backend sütun adı uyumu."""
    if name is None:
        return ""
    return str(name).lstrip("\ufeff").strip()

def _resolve_target_column(requested: str, df_columns: List[str]) -> Optional[str]:
    """İstenen hedef adını DataFrame sütunlarıyla eşleştirir (BOM + büyük/küçük harf)."""
    req_n = _norm_col_name(requested)
    if req_n in df_columns:
        return req_n
    low = {c.lower(): c for c in df_columns}
    if req_n.lower() in low:
        return low[req_n.lower()]
    return None


def _is_demographic_fairness_col(name: str) -> bool:
    """
    Yaş / cinsiyet sütunlarını tanır (model özelliği olmasalar bile Step 7 fairness için saklanır).
    'advantage', 'percentage' gibi yanlış pozitifleri engeller — 'age' alt dizesi kullanılmaz.
    """
    n = _norm_col_name(name).lower()
    if n in ("age", "sex", "gender"):
        return True
    if "gender" in n:
        return True
    if n == "sex" or n.endswith("_sex") or n.startswith("sex_"):
        return True
    if n in ("patient_age", "age_years", "age_year"):
        return True
    if re.match(r"^age$", n) or re.match(r"^age_\w+$", n) or re.match(r"^\w+_age$", n):
        return True
    return False


@app.post("/api/prepare")
async def prepare_data(req: PrepareRequest):
    try:
        warnings: List[str] = []
        df = pd.DataFrame(req.rawRows)
        # Sütun adlarını normalize et (Excel/CSV BOM, boşluk)
        df = df.rename(columns={c: _norm_col_name(c) for c in df.columns})
        if df.empty:
            raise HTTPException(status_code=400, detail="Empty dataset provided")

        target_col = _resolve_target_column(req.targetColumn, list(df.columns))
        if not target_col:
            raise HTTPException(status_code=400, detail=f"Target column '{req.targetColumn}' not found in data")

        # Metadata sütun adlarını veriyle hizala
        def _meta_name(c: Dict[str, Any]) -> str:
            return _norm_col_name(c.get("name"))

        feature_cols = [
            _meta_name(c) for c in req.columns
            if c.get("role") in ["numeric", "category"] and _meta_name(c) in df.columns
        ]
        num_cols = [
            _meta_name(c) for c in req.columns
            if c.get("role") == "numeric" and _meta_name(c) in df.columns
        ]
        cat_cols = [
            _meta_name(c) for c in req.columns
            if c.get("role") == "category" and _meta_name(c) in df.columns
        ]

        # Before stats (tüm dataset üzerinden)
        before_stats = {
            "class_balance": get_class_balance(df, target_col),
            "features": {}
        }
        for col in num_cols:
            before_stats["features"][col] = get_stats(df, col, 'numeric')
        # Aggregate numeric stats across all numeric feature values (global)
        before_stats["numeric_aggregate"] = get_aggregate_numeric_stats(df, num_cols)

        keep_cols = list(dict.fromkeys(feature_cols + [target_col]))
        fairness_extra = [
            c for c in df.columns
            if c not in keep_cols and _is_demographic_fairness_col(c)
        ]
        keep_cols = list(dict.fromkeys(keep_cols + fairness_extra))
        df = df[keep_cols]
        df = df.dropna(subset=[target_col])

        X = df[feature_cols].copy()
        y = df[target_col]

        for col in num_cols:
            X[col] = pd.to_numeric(X[col], errors='coerce').astype(np.float64)

        # --- Train/Test Split ---
        # Stratify: sadece > 1 sınıf varsa VE her sınıfta en az 2 örnek varsa
        try:
            min_class_count = int(y.value_counts().min())
            use_stratify = len(y.unique()) > 1 and min_class_count >= 2
            X_train, X_test, y_train, y_test = train_test_split(
                X, y,
                test_size=req.settings.testSize,
                random_state=42,
                stratify=y if use_stratify else None
            )
        except ValueError:
            # Stratify başarısız olursa stratify'sız dene
            X_train, X_test, y_train, y_test = train_test_split(
                X, y,
                test_size=req.settings.testSize,
                random_state=42
            )

        dem_cols = [c for c in fairness_extra if c in df.columns]
        df_test_dem = df.loc[X_test.index, dem_cols].copy() if dem_cols else None

        # --- Tüm-NaN kolon temizleme (düzeltilmiş mantık) ---
        num_cols_valid = [c for c in num_cols if X_train[c].notna().any()]
        cat_cols_valid = [c for c in cat_cols if X_train[c].notna().any()]
        valid_set = set(num_cols_valid + cat_cols_valid)
        drop_cols = [c for c in num_cols + cat_cols if c not in valid_set]  # FIX: 'and' yerine set farkı
        if drop_cols:
            X_train = X_train.drop(columns=drop_cols)
            X_test = X_test.drop(columns=drop_cols)
            feature_cols = [c for c in feature_cols if c not in drop_cols]
        num_cols = num_cols_valid
        cat_cols = cat_cols_valid

        # --- Missing Values ---
        dropped_train = 0
        dropped_test = 0
        if req.settings.missingValueStrategy == 'drop':
            train_before = len(X_train)
            test_before = len(X_test)
            train_mask = X_train.notna().all(axis=1)
            X_train = X_train[train_mask]
            y_train = y_train[train_mask]
            test_mask = X_test.notna().all(axis=1)
            X_test = X_test[test_mask]
            y_test = y_test[test_mask]
            if df_test_dem is not None:
                df_test_dem = df_test_dem.loc[X_test.index]
            dropped_train = train_before - len(X_train)
            dropped_test = test_before - len(X_test)
        else:
            # FIX: explicit if/elif/else — 'mode' artık belirsiz değil
            if req.settings.missingValueStrategy == 'median':
                num_strategy = 'median'
            elif req.settings.missingValueStrategy == 'mode':
                num_strategy = 'most_frequent'
            else:
                num_strategy = 'median'  # fallback

            if num_cols:
                num_imputer = SimpleImputer(strategy=num_strategy)
                arr_train = num_imputer.fit_transform(X_train[num_cols])
                arr_test = num_imputer.transform(X_test[num_cols]) if not X_test.empty else None
                for i, col in enumerate(num_cols):
                    X_train[col] = arr_train[:, i].astype(np.float64)
                    if arr_test is not None:
                        X_test[col] = arr_test[:, i].astype(np.float64)

            if cat_cols:
                # Kategorik kolonlar için her zaman most_frequent
                cat_imputer = SimpleImputer(strategy='most_frequent')
                arr_train = cat_imputer.fit_transform(X_train[cat_cols])
                arr_test = cat_imputer.transform(X_test[cat_cols]) if not X_test.empty else None
                for i, col in enumerate(cat_cols):
                    X_train[col] = arr_train[:, i]
                    if arr_test is not None:
                        X_test[col] = arr_test[:, i]

        # Fairness subgroup bucketing needs real years, not z-scores / min-max scaled values.
        # Snapshot after imputation, before normalisation (still comparable across train/test).
        fairness_raw_snapshots: Dict[str, Tuple[np.ndarray, np.ndarray]] = {}
        for col in num_cols:
            if _is_demographic_fairness_col(col) and col in X_test.columns:
                fairness_raw_snapshots[col] = (
                    np.array(X_train[col].values, copy=True),
                    np.array(X_test[col].values, copy=True),
                )

        # --- Normalisation ---
        if req.settings.normalisation != 'none' and num_cols:
            scaler = StandardScaler() if req.settings.normalisation == 'zscore' else MinMaxScaler()
            arr_train = scaler.fit_transform(X_train[num_cols])
            arr_test = scaler.transform(X_test[num_cols]) if not X_test.empty else None
            for i, col in enumerate(num_cols):
                X_train[col] = arr_train[:, i].astype(np.float64)
                if arr_test is not None:
                    X_test[col] = arr_test[:, i].astype(np.float64)

        after_stats = {
            "class_balance_before_smote": get_class_balance(
                pd.DataFrame({target_col: y_train}), target_col
            ),
            "features": {}
        }
        for col in num_cols:
            after_stats["features"][col] = get_stats(X_train, col, 'numeric')
        # Aggregate numeric stats across all numeric feature values (global, after imputation/normalisation)
        after_stats["numeric_aggregate"] = get_aggregate_numeric_stats(X_train, num_cols)

        # --- SMOTE ---
        applied_smote = False
        if req.settings.smote and len(pd.Series(y_train).unique()) > 1:
            try:
                min_count = int(pd.Series(y_train).value_counts().min())
                # SMOTE requires at least k_neighbors+1 samples in the minority class.
                # With imblearn defaults, this effectively means >= 6 samples.
                if min_count > 5:
                    col_names = X_train.columns.tolist()
                    encoders = {}
                    X_train_encoded = X_train.copy()
                    for col in cat_cols:
                        encoded, uniques = pd.factorize(X_train_encoded[col])
                        encoders[col] = np.array(uniques)
                        X_train_encoded[col] = encoded.astype(float)

                    smote_obj = SMOTE(random_state=42)
                    X_res, y_res = smote_obj.fit_resample(X_train_encoded, y_train)

                    X_train = pd.DataFrame(X_res, columns=col_names)
                    y_train = y_res  # numpy array

                    for col in cat_cols:
                        labels = encoders[col]
                        raw = X_train[col].values
                        decoded = []
                        for v in raw:
                            idx = int(round(float(v)))
                            # FIX: clamp — out-of-range indekslerden korun
                            idx = max(0, min(idx, len(labels) - 1))
                            decoded.append(labels[idx] if len(labels) > 0 else None)
                        X_train[col] = decoded

                    applied_smote = True
                else:
                    warnings.append(
                        "SMOTE could not be applied — some classes have fewer than 6 samples. Consider using class weights instead."
                    )
            except Exception as e:
                print(f"SMOTE failed, continuing without it: {str(e)}")
                warnings.append(
                    "SMOTE could not be applied — some classes have fewer than 6 samples. Consider using class weights instead."
                )

        after_stats["class_balance"] = get_class_balance(
            pd.DataFrame({target_col: y_train}), target_col
        )
        after_stats["applied_smote"] = applied_smote

        train_df = X_train.copy()
        # FIX: y_train numpy array olabilir (.values yok), np.array() ile güvenle al
        train_df[target_col] = np.array(y_train)

        test_df = X_test.copy()
        test_df[target_col] = np.array(y_test)
        if df_test_dem is not None and not df_test_dem.empty:
            for c in df_test_dem.columns:
                test_df[c] = df_test_dem[c].values

        for col, (tr_raw, te_raw) in fairness_raw_snapshots.items():
            test_df[col + "_raw"] = te_raw

        if not applied_smote and fairness_raw_snapshots:
            for col, (tr_raw, te_raw) in fairness_raw_snapshots.items():
                if len(tr_raw) == len(train_df):
                    train_df[col + "_raw"] = tr_raw

        if not applied_smote and dem_cols:
            try:
                train_dem = df.loc[X_train.index, dem_cols]
                for c in train_dem.columns:
                    if c not in train_df.columns:
                        train_df[c] = train_dem[c].values
            except Exception:
                pass

        # FIX: "None" string yerine gerçek JSON null (None) kullan
        train_df = safe_json_serialize(train_df)
        test_df = safe_json_serialize(test_df)

        return {
            "ok": True,
            "trainRows": train_df.to_dict(orient="records"),
            "testRows": test_df.to_dict(orient="records"),
            "beforeStats": before_stats,
            "afterStats": after_stats,
            "warnings": warnings,
            "meta": {
                "dropped_train": dropped_train,
                "dropped_test": dropped_test,
                "applied_smote": applied_smote,
            }
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/train")
async def train_model(req: TrainingRequest):
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
        
        m_type = req.modelType
        p = req.params
        model_name_display = m_type.upper()
        model = None
        
        if m_type == "knn":
            k = int(p.get("k", 5))
            dist = "manhattan" if "manhattan" in str(p.get("dist", "")).lower() else "euclidean"
            model = KNeighborsClassifier(n_neighbors=k, metric=dist)
            model_name_display = f"KNN (K={k})"
            
        elif m_type == "svm":
            kernel = p.get("kernel", "rbf")
            c = float(p.get("c", 1.0))
            model = SVC(kernel=kernel, C=c, probability=True, random_state=42)
            model_name_display = f"SVM ({kernel.upper()}, C={c})"
            
        elif m_type == "dt":
            depth = int(p.get("depth", 5))
            criterion = "entropy" if "entropy" in str(p.get("criterion", "")).lower() else "gini"
            model = DecisionTreeClassifier(max_depth=depth, criterion=criterion, random_state=42)
            model_name_display = f"Decision Tree (depth={depth})"
            
        elif m_type == "rf":
            trees = int(p.get("trees", 100))
            depth = int(p.get("depth", 10))
            model = RandomForestClassifier(n_estimators=trees, max_depth=depth, random_state=42)
            model_name_display = f"Random Forest ({trees} trees)"
            
        elif m_type == "lr":
            c = float(p.get("c", 1.0))
            max_iter = int(p.get("iter", 1000))
            model = LogisticRegression(C=c, max_iter=max_iter, random_state=42)
            model_name_display = f"Logistic Regression (C={c})"
            
        elif m_type == "nb":
            model = GaussianNB()
            model_name_display = "Naïve Bayes"
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown model type: {m_type}")
            
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        df_test_raw = pd.DataFrame(req.testRows)

        labels = np.unique(y_test)
        explain_payload: Dict[str, Any] = {}
        fairness_payload: Dict[str, Any] = {}
        if len(labels) >= 2:
            # Assume binary classification; intelligently select pos_label
            pos_label = labels[1]
            for lbl in labels:
                lbl_str = str(lbl).lower().strip()
                if lbl_str in ['1', '1.0', 'yes', 'true', 'positive', 'malignant', 'pathological', 'abnormal']:
                    pos_label = lbl
                    break
            acc = accuracy_score(y_test, y_pred)
            sens = recall_score(y_test, y_pred, pos_label=pos_label, zero_division=0)
            prec = precision_score(y_test, y_pred, pos_label=pos_label, zero_division=0)
            f1 = f1_score(y_test, y_pred, pos_label=pos_label, zero_division=0)
            
            cm = confusion_matrix(y_test, y_pred, labels=labels)
            tn = fp = fn = tp = 0
            if cm.shape == (2, 2):
                tn, fp, fn, tp = cm.ravel()
                spec = tn / (tn + fp) if (tn + fp) > 0 else 0
            else:
                spec = 0
                
            auc_val = 0.0
            roc_points = []
            pos_idx: Optional[int] = None
            if hasattr(model, "predict_proba"):
                y_prob = model.predict_proba(X_test)
                if pos_label in model.classes_:
                    pos_idx = list(model.classes_).index(pos_label)
                    import math
                    try:
                        auc_val = roc_auc_score(y_test, y_prob[:, pos_idx])
                        if math.isnan(auc_val): auc_val = 0.0
                        
                        # Generate ROC curve points
                        fpr, tpr, _ = roc_curve(y_test, y_prob[:, pos_idx], pos_label=pos_label)
                        # Sample max 100 points to avoid large payload if test set is huge
                        if len(fpr) > 100:
                            indices = np.linspace(0, len(fpr)-1, 100, dtype=int)
                            fpr = fpr[indices]
                            tpr = tpr[indices]
                        roc_points = [{"x": float(f), "y": float(t)} for f, t in zip(fpr, tpr)]
                    except:
                        pass

            if pos_idx is not None:
                try:
                    explain_payload = _build_explainability(
                        model,
                        m_type,
                        X_train,
                        X_test,
                        y_test,
                        y_pred,
                        df_test_raw,
                        list(req.features),
                        cat_cols,
                        pos_idx,
                        pos_label,
                    )
                except Exception:
                    import traceback
                    traceback.print_exc()
                    explain_payload = {}

            try:
                fairness_payload = _compute_fairness_subgroups(
                    df_test_raw, y_test, y_pred, pos_label, labels
                )
            except Exception:
                import traceback
                traceback.print_exc()
                fairness_payload = {}
        else:
            acc = accuracy_score(y_test, y_pred)
            sens = 0.0
            spec = 0.0
            auc_val = 0.0
            tn = fp = fn = tp = 0
            roc_points = []
            prec = 0.0
            f1 = 0.0
            fairness_payload = {}
            
        return {
            "ok": True,
            "model_id": m_type,
            "model_name_display": model_name_display,
            "accuracy": f"{int(round(acc * 100))}%",
            "sensitivity": f"{int(round(sens * 100))}%",
            "specificity": f"{int(round(spec * 100))}%",
            "precision": f"{int(round(prec * 100))}%",
            "f1_score": f"{int(round(f1 * 100))}%",
            "auc": round(float(auc_val), 2),
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
            "roc_points": roc_points,
            "feature_importance": explain_payload.get("feature_importance", []),
            "test_explanations": explain_payload.get("test_explanations", []),
            "positive_class": explain_payload.get("positive_class"),
            "fairness": fairness_payload,
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

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
    # Optional for future: negative predictive value
    npv: Optional[str] = None

class CertificateRequest(BaseModel):
    domain: str
    checklist_total: int
    checklist_checked: int
    checklist_items: List[ChecklistItem]
    models: List[ModelMetrics]
    bias_findings: str

@app.post("/api/generate-certificate")
async def generate_certificate(req: CertificateRequest):
    try:
        from fpdf import FPDF

        # Revert to the original simple certificate layout (content unchanged)
        pdf = FPDF()
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)

        pdf.set_font("Helvetica", 'B', 16)
        pdf.set_text_color(26, 107, 154)
        pdf.cell(0, 10, "Health-AI Summary Certificate", ln=True, align="C")

        pdf.set_font("Helvetica", '', 10)
        pdf.set_text_color(100, 100, 100)
        date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        pdf.cell(0, 5, f"Generated on {date_str}", ln=True, align="C")
        pdf.ln(10)

        pdf.set_font("Helvetica", 'B', 12)
        pdf.set_text_color(13, 35, 64)
        pdf.cell(0, 8, "Clinical Domain", ln=True)
        pdf.set_font("Helvetica", '', 11)
        pdf.set_text_color(30, 30, 30)
        pdf.multi_cell(0, 6, req.domain, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)

        pdf.set_font("Helvetica", 'B', 12)
        pdf.set_text_color(13, 35, 64)
        pdf.cell(0, 8, f"EU AI Act Compliance Checklist ({req.checklist_checked} of {req.checklist_total} completed)", ln=True)
        pdf.set_font("Helvetica", '', 10)
        pdf.set_text_color(30, 30, 30)
        for item in req.checklist_items:
            status = "[ X ]" if item.checked else "[   ]"
            text = (item.text or "").encode('latin-1', 'replace').decode('latin-1')
            pdf.multi_cell(0, 6, f"{status} {text}", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)

        pdf.set_font("Helvetica", 'B', 12)
        pdf.set_text_color(13, 35, 64)
        pdf.cell(0, 8, "Ethics & Bias Findings", ln=True)
        pdf.set_font("Helvetica", '', 11)
        pdf.set_text_color(30, 30, 30)
        bias_text = req.bias_findings if req.bias_findings else "No bias analysis provided."
        bias_text = bias_text.encode('latin-1', 'replace').decode('latin-1')
        pdf.multi_cell(0, 6, bias_text, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(5)

        pdf.set_font("Helvetica", 'B', 12)
        pdf.set_text_color(13, 35, 64)
        pdf.cell(0, 8, "Model Comparison", ln=True)

        pdf.set_font("Helvetica", 'B', 9)
        pdf.set_fill_color(232, 244, 250)

        col_w = [45, 23, 23, 23, 23, 23, 23]
        headers = ["Model", "Accuracy", "Sensitivity", "Specificity", "PPV", "NPV", "AUC"]
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 8, h, border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", '', 9)
        if not req.models:
            pdf.cell(sum(col_w), 8, "No models trained yet.", border=1, align="C")
            pdf.ln()
        else:
            for m in req.models:
                pdf.cell(col_w[0], 8, (m.name or "").encode('latin-1', 'replace').decode('latin-1'), border=1)
                pdf.cell(col_w[1], 8, m.accuracy, border=1)
                pdf.cell(col_w[2], 8, m.sensitivity, border=1)
                pdf.cell(col_w[3], 8, m.specificity, border=1)
                # PPV == Precision
                pdf.cell(col_w[4], 8, m.precision, border=1)
                # NPV is not currently provided by frontend payload
                # Use ASCII placeholder to avoid Helvetica encoding errors
                pdf.cell(col_w[5], 8, (m.npv or "N/A"), border=1)
                pdf.cell(col_w[6], 8, m.auc, border=1)
                pdf.ln()

        pdf.ln(10)
        pdf.set_font("Helvetica", 'I', 8)
        pdf.set_text_color(100, 100, 100)
        footer_text = "This certificate documents your completion of the Health-AI ML Learning Tool pipeline. For educational purposes. Not for clinical decision-making without qualified professional review."
        pdf.multi_cell(0, 4, footer_text, new_x="LMARGIN", new_y="NEXT")
        
        return Response(content=bytes(pdf.output()), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=HealthAI-Summary-Certificate.pdf"
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))