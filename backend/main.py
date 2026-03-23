from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from imblearn.over_sampling import SMOTE
from typing import List, Dict, Any, Optional
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import GaussianNB
from sklearn.metrics import accuracy_score, recall_score, roc_auc_score, confusion_matrix

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
    # Local dev defaults (python -m http.server 8080)
    return [
        "https://healthai-juniorengineers-2.onrender.com",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
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

@app.post("/api/prepare")
async def prepare_data(req: PrepareRequest):
    try:
        warnings: List[str] = []
        df = pd.DataFrame(req.rawRows)
        if df.empty:
            raise HTTPException(status_code=400, detail="Empty dataset provided")
        if req.targetColumn not in df.columns:
            raise HTTPException(status_code=400, detail=f"Target column '{req.targetColumn}' not found in data")

        feature_cols = [c['name'] for c in req.columns if c['role'] in ['numeric', 'category'] and c['name'] in df.columns]
        num_cols = [c['name'] for c in req.columns if c['role'] == 'numeric' and c['name'] in df.columns]
        cat_cols = [c['name'] for c in req.columns if c['role'] == 'category' and c['name'] in df.columns]

        # Before stats (tüm dataset üzerinden)
        before_stats = {
            "class_balance": get_class_balance(df, req.targetColumn),
            "features": {}
        }
        for col in num_cols:
            before_stats["features"][col] = get_stats(df, col, 'numeric')
        # Aggregate numeric stats across all numeric feature values (global)
        before_stats["numeric_aggregate"] = get_aggregate_numeric_stats(df, num_cols)

        keep_cols = feature_cols + [req.targetColumn]
        df = df[keep_cols]
        df = df.dropna(subset=[req.targetColumn])

        X = df[feature_cols].copy()
        y = df[req.targetColumn]

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
                pd.DataFrame({req.targetColumn: y_train}), req.targetColumn
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
            pd.DataFrame({req.targetColumn: y_train}), req.targetColumn
        )
        after_stats["applied_smote"] = applied_smote

        train_df = X_train.copy()
        # FIX: y_train numpy array olabilir (.values yok), np.array() ile güvenle al
        train_df[req.targetColumn] = np.array(y_train)

        test_df = X_test.copy()
        test_df[req.targetColumn] = np.array(y_test)

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
        
        labels = np.unique(y_test)
        if len(labels) >= 2:
            # Assume binary classification; pos_label is usually 1 or the second class
            pos_label = labels[1]
            if 1 in labels: pos_label = 1
            if 'Yes' in labels: pos_label = 'Yes'
            
            acc = accuracy_score(y_test, y_pred)
            sens = recall_score(y_test, y_pred, pos_label=pos_label, zero_division=0)
            
            cm = confusion_matrix(y_test, y_pred, labels=labels)
            if cm.shape == (2, 2):
                tn, fp, fn, tp = cm.ravel()
                spec = tn / (tn + fp) if (tn + fp) > 0 else 0
            else:
                spec = 0
                
            auc_val = 0.0
            if hasattr(model, "predict_proba"):
                y_prob = model.predict_proba(X_test)
                if pos_label in model.classes_:
                    pos_idx = list(model.classes_).index(pos_label)
                    import math
                    try:
                        auc_val = roc_auc_score(y_test, y_prob[:, pos_idx])
                        if math.isnan(auc_val): auc_val = 0.0
                    except:
                        pass
        else:
            acc = accuracy_score(y_test, y_pred)
            sens = 0.0
            spec = 0.0
            auc_val = 0.0
            
        return {
            "ok": True,
            "model_id": m_type,
            "model_name_display": model_name_display,
            "accuracy": f"{int(round(acc * 100))}%",
            "sensitivity": f"{int(round(sens * 100))}%",
            "specificity": f"{int(round(spec * 100))}%",
            "auc": f"{round(auc_val, 2)}"
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))