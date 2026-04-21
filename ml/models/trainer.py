from typing import Dict, Any, Optional, Tuple
import pandas as pd
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.naive_bayes import GaussianNB

def _parse(raw: str, choices: Dict[str, str], default: str) -> str:
    """
    Map a human-readable frontend dropdown string (e.g. 'Gini impurity — most common choice')
    to a short sklearn keyword (e.g. 'gini').
    Checks if any key appears in lowercase raw string.
    """
    raw_lower = str(raw).lower()
    for keyword, value in choices.items():
        if keyword in raw_lower:
            return value
    return default


def create_model(model_type: str, params: Dict[str, Any]) -> Tuple[Any, str]:
    """
    Factory function to create a scikit-learn model based on type and parameters.
    """
    m_type = model_type.lower()
    p = params
    model = None
    display_name = ""

    if m_type == "knn":
        k = int(p.get("k", 5))
        dist = _parse(p.get("dist", "euclidean"), {
            "manhattan": "manhattan",
            "euclidean": "euclidean",
        }, "euclidean")
        model = KNeighborsClassifier(n_neighbors=k, metric=dist)
        display_name = f"KNN (K={k})"

    elif m_type == "svm":
        kernel = _parse(p.get("kernel", "rbf"), {
            "rbf":    "rbf",
            "linear": "linear",
            "poly":   "poly",
        }, "rbf")
        c = float(p.get("c", 1.0))
        model = SVC(kernel=kernel, C=c, probability=True, random_state=42)
        display_name = f"SVM ({kernel.upper()}, C={c})"

    elif m_type == "dt":
        depth = int(p.get("depth", 5))
        criterion = _parse(p.get("criterion", "gini"), {
            "gini":     "gini",
            "entropy":  "entropy",
            "log_loss": "log_loss",
        }, "gini")
        model = DecisionTreeClassifier(max_depth=depth, criterion=criterion, random_state=42)
        display_name = f"Decision Tree (depth={depth})"

    elif m_type == "rf":
        trees = int(p.get("trees", 100))
        depth = int(p.get("depth", 10))
        criterion = _parse(p.get("criterion", "gini"), {
            "gini":     "gini",
            "entropy":  "entropy",
            "log_loss": "log_loss",
        }, "gini")
        model = RandomForestClassifier(
            n_estimators=trees, max_depth=depth,
            criterion=criterion, random_state=42
        )
        display_name = f"Random Forest ({trees} trees)"

    elif m_type == "lr":
        c = float(p.get("c", 1.0))
        max_iter = int(p.get("iter", 1000))
        model = LogisticRegression(C=c, max_iter=max_iter, random_state=42)
        display_name = f"Logistic Regression (C={c})"

    elif m_type == "nb":
        model = GaussianNB()
        display_name = "Naïve Bayes"

    else:
        raise ValueError(f"Unknown model type: {m_type}")

    return model, display_name

def train_model(model: Any, X_train: pd.DataFrame, y_train: pd.Series) -> Any:
    """
    Fit the model to the training data.
    """
    # Ensure one-hot encoding or other preprocessing is done BEFORE this call if needed,
    # but scikit-learn models expect numeric data.
    return model.fit(X_train, y_train)
