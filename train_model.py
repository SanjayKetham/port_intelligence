"""
ML Training Pipeline for Port Congestion Prediction
=====================================================
Trains an ensemble model (Random Forest + XGBoost) with SHAP-based
explainability for predicting port congestion and delays.

Features:
  - Feature engineering & preprocessing
  - Stratified train/test split
  - Hyperparameter-tuned ensemble
  - SHAP values for global & local explanations
  - Model evaluation with multiple metrics
  - Exports trained models and artifacts for the API

Author: Aiqon AI Internship Assignment
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib
import shap
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report,
    mean_absolute_error, mean_squared_error
)
from sklearn.linear_model import LinearRegression
from xgboost import XGBClassifier

warnings.filterwarnings('ignore')

# ─── Configuration ───────────────────────────────────────────────────────────

DATA_PATH = os.path.join("data", "port_congestion_dataset.csv")
MODEL_DIR = "models"
PLOTS_DIR = os.path.join("static", "plots")
RANDOM_STATE = 42
TEST_SIZE = 0.2

# Features to use for modeling
CATEGORICAL_FEATURES = ["port_name", "vessel_type", "weather_condition", "port_region"]
NUMERICAL_FEATURES = [
    "berth_count", "port_capacity_vessels", "vessel_size_dwt", "cargo_volume_teu",
    "month", "day_of_week", "hour_of_day", "is_weekend",
    "vessels_in_port", "queue_length", "port_utilization_pct",
    "wind_speed_knots", "tide_height_m", "labor_availability_pct",
    "expected_turnaround_hrs", "historical_delay_rate", "upcoming_arrivals_6h"
]
TARGET = "is_congested"


# ─── Data Loading & Feature Engineering ──────────────────────────────────────

def load_and_preprocess(path):
    """Load dataset and engineer features"""
    df = pd.read_csv(path)
    print(f"Loaded {len(df)} records from {path}")
    
    # ── Derived Features ──
    # Traffic density: vessels relative to capacity
    df["traffic_density"] = df["vessels_in_port"] / df["port_capacity_vessels"]
    
    # Queue-to-berth ratio
    df["queue_berth_ratio"] = df["queue_length"] / df["berth_count"]
    
    # Arrival pressure: upcoming + current vessels vs capacity
    df["arrival_pressure"] = (df["vessels_in_port"] + df["upcoming_arrivals_6h"]) / df["port_capacity_vessels"]
    
    # Weather severity numeric
    weather_severity = {"Clear": 0, "Cloudy": 1, "Rain": 2, "Fog": 3, "High Winds": 4, "Storm": 5}
    df["weather_severity"] = df["weather_condition"].map(weather_severity)
    
    # Interaction: weather × utilization
    df["weather_utilization_interaction"] = df["weather_severity"] * df["port_utilization_pct"] / 100
    
    # Interaction: traffic × labor shortage
    df["traffic_labor_interaction"] = df["traffic_density"] * (100 - df["labor_availability_pct"]) / 100
    
    # Is peak season (Q4)
    df["is_peak_season"] = (df["month"].isin([10, 11, 12])).astype(int)
    
    # Is peak hours (6-10 AM)
    df["is_peak_hours"] = ((df["hour_of_day"] >= 6) & (df["hour_of_day"] < 10)).astype(int)
    
    return df


def prepare_features(df, label_encoders=None, scaler=None, fit=True):
    """Encode categorical variables and scale numerical features"""
    
    # Updated feature list with engineered features
    engineered_features = [
        "traffic_density", "queue_berth_ratio", "arrival_pressure",
        "weather_severity", "weather_utilization_interaction",
        "traffic_labor_interaction", "is_peak_season", "is_peak_hours"
    ]
    
    all_numerical = NUMERICAL_FEATURES + engineered_features
    
    if fit:
        label_encoders = {}
        for col in CATEGORICAL_FEATURES:
            le = LabelEncoder()
            df[col + "_encoded"] = le.fit_transform(df[col])
            label_encoders[col] = le
    else:
        for col in CATEGORICAL_FEATURES:
            df[col + "_encoded"] = label_encoders[col].transform(df[col])
    
    encoded_features = [col + "_encoded" for col in CATEGORICAL_FEATURES]
    feature_cols = all_numerical + encoded_features
    
    X = df[feature_cols].copy()
    
    # Scale numerical features
    if fit:
        scaler = StandardScaler()
        X[all_numerical] = scaler.fit_transform(X[all_numerical])
    else:
        X[all_numerical] = scaler.transform(X[all_numerical])
    
    return X, feature_cols, label_encoders, scaler


# ─── Model Training ─────────────────────────────────────────────────────────

def train_models(X_train, y_train, X_test, y_test, feature_names):
    """Train an ensemble of RF + XGBoost + GBM with voting"""
    
    print("\n" + "=" * 60)
    print("  Training Models")
    print("=" * 60)
    
    # ── Individual Models ──
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=RANDOM_STATE,
        n_jobs=-1
    )
    
    xgb = XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=len(y_train[y_train == 0]) / max(len(y_train[y_train == 1]), 1),
        random_state=RANDOM_STATE,
        eval_metric='logloss',
        use_label_encoder=False
    )
    
    gbm = GradientBoostingClassifier(
        n_estimators=150,
        max_depth=5,
        learning_rate=0.1,
        subsample=0.8,
        random_state=RANDOM_STATE
    )
    
    # ── Ensemble (Soft Voting) ──
    ensemble = VotingClassifier(
        estimators=[('rf', rf), ('xgb', xgb), ('gbm', gbm)],
        voting='soft',
        weights=[1, 2, 1]  # XGBoost gets higher weight
    )
    
    # Train individual models for analysis
    print("\n  Training Random Forest...")
    rf.fit(X_train, y_train)
    
    print("  Training XGBoost...")
    xgb.fit(X_train, y_train)
    
    print("  Training Gradient Boosting...")
    gbm.fit(X_train, y_train)
    
    print("  Training Ensemble (Voting)...")
    ensemble.fit(X_train, y_train)
    
    # ── Cross-Validation ──
    print("\n  Running 5-fold cross-validation...")
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = cross_val_score(ensemble, X_train, y_train, cv=cv, scoring='f1')
    print(f"  CV F1 Scores: {cv_scores.round(3)}")
    print(f"  CV F1 Mean:   {cv_scores.mean():.4f} +/- {cv_scores.std():.4f}")
    
    models = {
        "random_forest": rf,
        "xgboost": xgb,
        "gradient_boosting": gbm,
        "ensemble": ensemble,
    }
    
    return models, cv_scores


# ─── Model Evaluation ───────────────────────────────────────────────────────

def evaluate_models(models, X_test, y_test, feature_names):
    """Comprehensive evaluation of all models"""
    
    print("\n" + "=" * 60)
    print("  Model Evaluation")
    print("=" * 60)
    
    results = {}
    
    for name, model in models.items():
        y_pred = model.predict(X_test)
        y_proba = model.predict_proba(X_test)[:, 1]
        
        metrics = {
            "accuracy": round(accuracy_score(y_test, y_pred), 4),
            "precision": round(precision_score(y_test, y_pred, zero_division=0), 4),
            "recall": round(recall_score(y_test, y_pred, zero_division=0), 4),
            "f1_score": round(f1_score(y_test, y_pred, zero_division=0), 4),
            "roc_auc": round(roc_auc_score(y_test, y_proba), 4),
        }
        results[name] = metrics
        
        print(f"\n  -- {name.upper()} --")
        for metric, value in metrics.items():
            print(f"    {metric:>12}: {value:.4f}")
    
    return results


# ─── SHAP Explanations ──────────────────────────────────────────────────────

def compute_shap_explanations(model, X_train, X_test, feature_names):
    """Compute SHAP values for model interpretability"""
    
    print("\n" + "=" * 60)
    print("  Computing SHAP Explanations")
    print("=" * 60)
    
    # Use XGBoost from ensemble for SHAP (fastest TreeExplainer)
    xgb_model = model.named_estimators_['xgb']
    
    explainer = shap.TreeExplainer(xgb_model)
    shap_values = explainer.shap_values(X_test)
    
    # Global feature importance (mean |SHAP|)
    mean_shap = np.abs(shap_values).mean(axis=0)
    feature_importance = pd.DataFrame({
        'feature': feature_names,
        'importance': mean_shap
    }).sort_values('importance', ascending=False)
    
    print("\n  Top 10 Most Important Features (SHAP):")
    for i, row in feature_importance.head(10).iterrows():
        bar = "#" * int(row['importance'] * 50 / feature_importance['importance'].max())
        print(f"    {row['feature']:>35}: {row['importance']:.4f}  {bar}")
    
    return explainer, shap_values, feature_importance


# ─── Plot Generation ─────────────────────────────────────────────────────────

def generate_plots(models, X_test, y_test, feature_names, shap_values, feature_importance, df):
    """Generate all visualization plots"""
    
    print("\n" + "=" * 60)
    print("  Generating Plots")
    print("=" * 60)
    
    os.makedirs(PLOTS_DIR, exist_ok=True)
    
    # 1. Feature Importance Bar Chart
    plt.figure(figsize=(10, 6))
    top_features = feature_importance.head(15)
    colors = plt.cm.viridis(np.linspace(0.2, 0.8, len(top_features)))
    plt.barh(range(len(top_features)), top_features['importance'].values, color=colors)
    plt.yticks(range(len(top_features)), top_features['feature'].values)
    plt.xlabel('Mean |SHAP Value|')
    plt.title('Top 15 Features by Importance (SHAP)')
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, 'feature_importance.png'), dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Feature importance plot saved")
    
    # 2. Confusion Matrix
    ensemble = models["ensemble"]
    y_pred = ensemble.predict(X_test)
    cm = confusion_matrix(y_test, y_pred)
    plt.figure(figsize=(6, 5))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
                xticklabels=['No Congestion', 'Congestion'],
                yticklabels=['No Congestion', 'Congestion'])
    plt.xlabel('Predicted')
    plt.ylabel('Actual')
    plt.title('Confusion Matrix - Ensemble Model')
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, 'confusion_matrix.png'), dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Confusion matrix plot saved")
    
    # 3. Model Comparison
    model_names = []
    accuracies = []
    f1_scores_list = []
    auc_scores = []
    for name, model in models.items():
        y_pred_m = model.predict(X_test)
        y_proba_m = model.predict_proba(X_test)[:, 1]
        model_names.append(name.replace('_', ' ').title())
        accuracies.append(accuracy_score(y_test, y_pred_m))
        f1_scores_list.append(f1_score(y_test, y_pred_m))
        auc_scores.append(roc_auc_score(y_test, y_proba_m))
    
    x = np.arange(len(model_names))
    width = 0.25
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.bar(x - width, accuracies, width, label='Accuracy', color='#4A90D9')
    ax.bar(x, f1_scores_list, width, label='F1 Score', color='#E06C75')
    ax.bar(x + width, auc_scores, width, label='ROC AUC', color='#98C379')
    ax.set_ylabel('Score')
    ax.set_title('Model Comparison')
    ax.set_xticks(x)
    ax.set_xticklabels(model_names, rotation=15)
    ax.legend()
    ax.set_ylim(0, 1.1)
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, 'model_comparison.png'), dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Model comparison plot saved")
    
    # 4. Congestion by Port
    port_congestion = df.groupby('port_name')['is_congested'].mean().sort_values(ascending=True)
    plt.figure(figsize=(10, 5))
    colors = plt.cm.RdYlGn_r(port_congestion.values)
    port_congestion.plot(kind='barh', color=colors)
    plt.xlabel('Congestion Rate')
    plt.title('Congestion Rate by Port')
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, 'congestion_by_port.png'), dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Congestion by port plot saved")
    
    # 5. Monthly Congestion Trend
    monthly = df.groupby('month').agg({
        'is_congested': 'mean',
        'delay_hours': 'mean',
        'congestion_score': 'mean'
    }).reset_index()
    
    fig, ax1 = plt.subplots(figsize=(10, 5))
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    ax1.bar(monthly['month'], monthly['is_congested'] * 100, color='#E06C75', alpha=0.7, label='Congestion Rate %')
    ax1.set_ylabel('Congestion Rate (%)', color='#E06C75')
    ax1.set_xlabel('Month')
    ax2 = ax1.twinx()
    ax2.plot(monthly['month'], monthly['delay_hours'], color='#4A90D9', marker='o', linewidth=2, label='Avg Delay (hrs)')
    ax2.set_ylabel('Avg Delay (hours)', color='#4A90D9')
    ax1.set_xticks(range(1, 13))
    ax1.set_xticklabels(months)
    plt.title('Monthly Congestion Trends')
    fig.legend(loc='upper left', bbox_to_anchor=(0.12, 0.95))
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, 'monthly_trends.png'), dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Monthly trends plot saved")
    
    # 6. Correlation Heatmap for key features
    key_cols = ['vessels_in_port', 'queue_length', 'port_utilization_pct',
                'wind_speed_knots', 'labor_availability_pct', 'historical_delay_rate',
                'upcoming_arrivals_6h', 'congestion_score', 'delay_hours']
    corr = df[key_cols].corr()
    plt.figure(figsize=(9, 7))
    mask = np.triu(np.ones_like(corr, dtype=bool))
    sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='coolwarm',
                center=0, square=True, linewidths=0.5)
    plt.title('Feature Correlation Heatmap')
    plt.tight_layout()
    plt.savefig(os.path.join(PLOTS_DIR, 'correlation_heatmap.png'), dpi=150, bbox_inches='tight')
    plt.close()
    print("  [OK] Correlation heatmap saved")
    
    print(f"\n  All plots saved to: {PLOTS_DIR}/")


# ─── Save Artifacts ─────────────────────────────────────────────────────────

def save_artifacts(models, label_encoders, scaler, feature_names, feature_importance, eval_results, cv_scores, df):
    """Save trained models and metadata"""
    
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    # Save ensemble model
    joblib.dump(models["ensemble"], os.path.join(MODEL_DIR, "ensemble_model.pkl"))
    joblib.dump(models["xgboost"], os.path.join(MODEL_DIR, "xgboost_model.pkl"))
    joblib.dump(label_encoders, os.path.join(MODEL_DIR, "label_encoders.pkl"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.pkl"))
    
    # Save metadata
    metadata = {
        "feature_names": feature_names,
        "categorical_features": CATEGORICAL_FEATURES,
        "numerical_features": NUMERICAL_FEATURES,
        "feature_importance": feature_importance.to_dict(orient='records'),
        "evaluation_results": eval_results,
        "cv_scores": {
            "mean": round(float(cv_scores.mean()), 4),
            "std": round(float(cv_scores.std()), 4),
            "folds": cv_scores.round(4).tolist()
        },
        "dataset_stats": {
            "total_records": len(df),
            "congested_records": int(df["is_congested"].sum()),
            "congestion_rate": round(float(df["is_congested"].mean()), 4),
            "ports": df["port_name"].unique().tolist(),
            "avg_delay_congested": round(float(df[df["is_congested"]==1]["delay_hours"].mean()), 2),
            "avg_delay_non_congested": round(float(df[df["is_congested"]==0]["delay_hours"].mean()), 2),
        },
        "port_configs": {
            port: {
                "congestion_rate": round(float(df[df["port_name"]==port]["is_congested"].mean()), 4),
                "avg_delay": round(float(df[df["port_name"]==port]["delay_hours"].mean()), 2),
                "avg_utilization": round(float(df[df["port_name"]==port]["port_utilization_pct"].mean()), 2),
            }
            for port in df["port_name"].unique()
        }
    }
    
    with open(os.path.join(MODEL_DIR, "model_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    
    print(f"\n  [OK] Models saved to: {MODEL_DIR}/")
    print(f"  [OK] Metadata saved to: {MODEL_DIR}/model_metadata.json")


# ─── Main Pipeline ───────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Port Congestion Prediction - Training Pipeline")
    print("=" * 60)
    
    # 1. Load & preprocess data
    df = load_and_preprocess(DATA_PATH)
    
    # 2. Prepare features
    X, feature_names, label_encoders, scaler = prepare_features(df, fit=True)
    y = df[TARGET]
    
    print(f"\n  Features: {len(feature_names)}")
    print(f"  Target distribution: {dict(y.value_counts())}")
    
    # 3. Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE
    )
    print(f"  Train: {len(X_train)} | Test: {len(X_test)}")
    
    # 4. Train models
    models, cv_scores = train_models(X_train, y_train, X_test, y_test, feature_names)
    
    # 5. Evaluate
    eval_results = evaluate_models(models, X_test, y_test, feature_names)
    
    # 6. SHAP Explanations
    explainer, shap_values, feature_importance = compute_shap_explanations(
        models["ensemble"], X_train, X_test, feature_names
    )
    
    # 7. Generate plots
    generate_plots(models, X_test, y_test, feature_names, shap_values, feature_importance, df)
    
    # 8. Save artifacts
    save_artifacts(models, label_encoders, scaler, feature_names, feature_importance, eval_results, cv_scores, df)
    
    print("\n" + "=" * 60)
    print("  [OK] Training pipeline complete!")
    print("=" * 60)
    
    return models, eval_results


if __name__ == "__main__":
    main()
