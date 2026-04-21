from typing import List, Dict, Any, Tuple, Optional
import pandas as pd
import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from imblearn.over_sampling import SMOTE

def impute_missing_values(X_train: pd.DataFrame, X_test: pd.DataFrame, strategy: str, num_cols: List[str], cat_cols: List[str]) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Impute missing values using specified strategy.
    """
    if strategy == 'drop':
        # Drop logic is usually handled before imputation call in the pipeline, 
        # but we'll return as is if this is called.
        return X_train, X_test

    num_strategy = 'most_frequent' if strategy == 'mode' else 'median'
    
    if num_cols:
        # Find which columns are actually in X_train
        valid_num = [c for c in num_cols if c in X_train.columns]
        if valid_num:
            num_imputer = SimpleImputer(strategy=num_strategy)
            X_train[valid_num] = num_imputer.fit_transform(X_train[valid_num])
            if not X_test.empty:
                X_test[valid_num] = num_imputer.transform(X_test[valid_num])
    
    if cat_cols:
        valid_cat = [c for c in cat_cols if c in X_train.columns]
        if valid_cat:
            cat_imputer = SimpleImputer(strategy='most_frequent')
            X_train[valid_cat] = cat_imputer.fit_transform(X_train[valid_cat])
            if not X_test.empty:
                X_test[valid_cat] = cat_imputer.transform(X_test[valid_cat])
                
    return X_train, X_test

def normalize_data(X_train: pd.DataFrame, X_test: pd.DataFrame, method: str, num_cols: List[str]) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Normalize numeric data using Z-score (StandardScaler) or MinMax.
    """
    if method == 'none' or not num_cols:
        return X_train, X_test
    
    valid_num = [c for c in num_cols if c in X_train.columns]
    if not valid_num:
        return X_train, X_test

    scaler = StandardScaler() if method == 'zscore' else MinMaxScaler()
    X_train[valid_num] = scaler.fit_transform(X_train[valid_num])
    if not X_test.empty:
        X_test[valid_num] = scaler.transform(X_test[valid_num])
        
    return X_train, X_test

def apply_smote(X_train: pd.DataFrame, y_train: pd.Series, cat_cols: List[str]) -> Tuple[pd.DataFrame, pd.Series, bool]:
    """
    Apply SMOTE to balance classes, handling categorical encoding/decoding.
    """
    if len(pd.Series(y_train).unique()) <= 1:
        return X_train, y_train, False

    try:
        # Require at least 6 samples for SMOTE (default k_neighbors=5)
        if int(pd.Series(y_train).value_counts().min()) <= 5:
            return X_train, y_train, False

        col_names = X_train.columns.tolist()
        X_train_encoded = X_train.copy()
        
        # Simple factorize encoding for categorical columns
        encoders: Dict[str, Any] = {}
        for col in cat_cols:
            if col in X_train.columns:
                codes, labels = pd.factorize(X_train[col])
                X_train_encoded[col] = codes.astype(float)
                encoders[col] = np.array(labels)

        X_res, y_res = SMOTE(random_state=42).fit_resample(X_train_encoded, y_train)
        
        X_train_res = pd.DataFrame(X_res, columns=col_names)
        
        # Decode categorical columns back to strings
        for col, labels in encoders.items():
            if col in X_train_res.columns:
                X_train_res[col] = [
                    labels[max(0, min(int(round(float(v))), len(labels)-1))] 
                    if len(labels) > 0 else None 
                    for v in X_train_res[col]
                ]
        
        return X_train_res, y_res, True
    except Exception as e:
        print(f"SMOTE Error: {e}")
        return X_train, y_train, False
