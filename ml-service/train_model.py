"""
train_model.py
Trains and evaluates Random Forest and XGBoost fraud classifiers per the
methodology in Chapter 3: 80/20 stratified split, SMOTE oversampling on the
training set only (no leakage into test set), 5-fold stratified CV, and
evaluation via precision, recall, F1, AUC-ROC, confusion matrix.

Saves the best-performing model (by AUC-PR, appropriate for imbalanced data)
as model.joblib for the FastAPI inference service.
"""
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import (
    precision_score, recall_score, f1_score, roc_auc_score,
    average_precision_score, confusion_matrix, classification_report,
)
from imblearn.over_sampling import SMOTE
from xgboost import XGBClassifier

NUMERIC_FEATURES = [
    "amount", "hour", "day_of_week", "txn_count_1h", "avg_amount_deviation",
    "is_new_device", "is_new_location", "distance_km", "account_age_days",
    "is_high_risk_country", "billing_shipping_mismatch", "failed_attempts_last_hour",
]
CATEGORICAL_FEATURES = ["payment_method"]
ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def build_preprocessor():
    return ColumnTransformer(transformers=[
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
    ], remainder="passthrough")


def evaluate(name, model, X_test, y_test):
    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= 0.5).astype(int)
    metrics = {
        "precision": round(precision_score(y_test, preds), 4),
        "recall": round(recall_score(y_test, preds), 4),
        "f1": round(f1_score(y_test, preds), 4),
        "auc_roc": round(roc_auc_score(y_test, proba), 4),
        "auc_pr": round(average_precision_score(y_test, proba), 4),
    }
    cm = confusion_matrix(y_test, preds).tolist()
    print(f"\n=== {name} ===")
    print(json.dumps(metrics, indent=2))
    print("Confusion matrix [ [TN,FP],[FN,TP] ]:", cm)
    print(classification_report(y_test, preds, target_names=["legit", "fraud"]))
    return metrics, cm


def main():
    df = pd.read_csv("transactions_dataset.csv")
    X = df[ALL_FEATURES]
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42
    )

    pre = build_preprocessor()
    X_train_enc = pre.fit_transform(X_train)
    X_test_enc = pre.transform(X_test)

    # SMOTE oversampling on TRAINING data only, to avoid leakage into the test set
    smote = SMOTE(random_state=42)
    X_train_res, y_train_res = smote.fit_resample(X_train_enc, y_train)
    print(f"Post-SMOTE training class balance: {np.bincount(y_train_res)}")

    results = {}

    rf = RandomForestClassifier(
        n_estimators=300, max_depth=12, min_samples_leaf=3,
        class_weight="balanced", n_jobs=-1, random_state=42,
    )
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    rf_cv_auc = cross_val_score(rf, X_train_res, y_train_res, cv=cv, scoring="roc_auc", n_jobs=-1)
    print(f"Random Forest 5-fold CV AUC-ROC: {rf_cv_auc.mean():.4f} (+/- {rf_cv_auc.std():.4f})")
    rf.fit(X_train_res, y_train_res)
    results["random_forest"] = evaluate("Random Forest", rf, X_test_enc, y_test)

    xgb = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.08,
        scale_pos_weight=1,  # already balanced via SMOTE
        eval_metric="logloss", n_jobs=-1, random_state=42,
    )
    xgb.fit(X_train_res, y_train_res)
    results["xgboost"] = evaluate("XGBoost", xgb, X_test_enc, y_test)

    # Select best model by AUC-PR (most informative metric under class imbalance)
    best_name = max(results, key=lambda k: results[k][0]["auc_pr"])
    best_model = rf if best_name == "random_forest" else xgb
    print(f"\nBest model selected: {best_name}")

    pipeline = Pipeline([("pre", pre), ("clf", best_model)])
    # Re-fit the full pipeline cleanly on original (non-SMOTE) train split so the
    # saved artifact is a single deployable object; SMOTE was only for model selection/training signal.
    pipeline.fit(X_train, y_train)
    final_metrics, final_cm = evaluate(f"{best_name} (final pipeline)", pipeline, X_test, y_test)

    joblib.dump(pipeline, "model.joblib")
    with open("model_metrics.json", "w") as f:
        json.dump({
            "best_model": best_name,
            "metrics": final_metrics,
            "confusion_matrix": final_cm,
            "features": ALL_FEATURES,
            "training_rows": len(X_train),
            "test_rows": len(X_test),
            "fraud_rate": round(float(y.mean()), 5),
        }, f, indent=2)
    print("\nSaved model.joblib and model_metrics.json")


if __name__ == "__main__":
    main()
