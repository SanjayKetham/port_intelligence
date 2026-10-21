# 🚢 Aiqon — Port Congestion Intelligence System

**AI-Powered Prediction of Port Congestion and Shipment Delays**

An end-to-end machine learning system that predicts port congestion likelihood, provides confidence scores, and explains the key factors driving each prediction using SHAP-based explainability.

---

## 📋 Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Features](#features)
- [Setup & Installation](#setup--installation)
- [Usage](#usage)
- [Dataset](#dataset)
- [Model Details](#model-details)
- [Evaluation](#evaluation)
- [Congestion Definition](#congestion-definition)
- [API Reference](#api-reference)
- [Challenges Addressed](#challenges-addressed)
- [Project Structure](#project-structure)

---

## 🔍 Overview

Port congestion is one of the most significant sources of delay and uncertainty in global logistics. This system leverages machine learning and explainable AI (XAI) to:

1. **Predict** the likelihood of congestion or delay at a given port
2. **Quantify** confidence in each prediction (0–100%)
3. **Explain** the key factors contributing to each prediction using SHAP values

The system includes a **web-based dashboard** for interactive prediction, analytics visualization, and model performance monitoring.

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Dashboard (HTML/CSS/JS)              │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │Dashboard │  │ Predict  │  │Analytics │  │   Model    │  │
│  │  (KPIs)  │  │  (Form)  │  │ (Charts) │  │(Eval/Docs) │  │
│  └─────────┘  └──────────┘  └──────────┘  └────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────────┐
│                   Flask API Server (app.py)                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  /api/predict│  │ /api/stats   │  │   /api/ports      │  │
│  │  Ensemble +  │  │ Dataset &    │  │   Port configs    │  │
│  │  SHAP Explain│  │ Model metrics│  │   & analytics     │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│               ML Pipeline (train_model.py)                   │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ RF (200)   │  │ XGBoost(200) │  │ GBM (150)          │  │
│  └─────┬──────┘  └──────┬───────┘  └─────────┬──────────┘  │
│        └────────────┬────┘                    │             │
│              ┌──────▼────────┐                │             │
│              │ Soft Voting   │◄───────────────┘             │
│              │ Ensemble      │                              │
│              │ (1:2:1 wts)   │                              │
│              └──────┬────────┘                              │
│                     │                                       │
│              ┌──────▼────────┐                              │
│              │ SHAP Explainer│                              │
│              │ (TreeExplainer)│                             │
│              └───────────────┘                              │
└─────────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│          Synthetic Dataset (generate_dataset.py)             │
│  400 records • 8 ports • 25+ features • Temporal patterns   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### Prediction Engine
- **Ensemble Model**: Soft-voting combination of Random Forest, XGBoost, and Gradient Boosting
- **Confidence Scores**: Probability-based confidence for every prediction
- **Risk Levels**: Low / Medium / High / Critical classification
- **Delay Estimation**: Estimated delay hours based on congestion probability

### Explainability
- **SHAP Values**: TreeExplainer provides local and global feature importance
- **Human-Readable Explanations**: Top 5 contributing factors with contextual descriptions
- **Factor Impact Direction**: Shows whether each factor increases or decreases congestion risk

### Interactive Dashboard
- **KPI Overview**: Real-time metrics on model performance and congestion rates
- **Port Analytics**: Per-port congestion rates, delays, and capacity metrics
- **Scenario Builder**: Configure port conditions and get instant predictions
- **Analytics Charts**: Monthly trends, weather impact, feature importance, vessel analysis
- **Model Performance**: Detailed evaluation metrics across all models

---

## 🚀 Setup & Installation

### Prerequisites
- Python 3.9+
- pip

### Installation

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Generate the synthetic dataset
python generate_dataset.py

# 3. Train the ML models
python train_model.py

# 4. Start the web server
python app.py
```

The dashboard will be available at **http://localhost:5000**

---

## 📊 Dataset

### Synthetic Dataset Design

The dataset simulates port operations across **8 global ports** with **400 records** spanning a full year. It captures realistic interactions between:

| Feature Category | Features |
|---|---|
| **Port Operations** | berth_count, port_capacity, utilization_pct, queue_length |
| **Vessel Info** | vessel_type, vessel_size_dwt, cargo_volume_teu |
| **Weather** | weather_condition, wind_speed_knots, tide_height_m |
| **Temporal** | month, day_of_week, hour_of_day, is_weekend |
| **Traffic** | vessels_in_port, upcoming_arrivals_6h, historical_delay_rate |
| **Labor** | labor_availability_pct |

### Ports Modeled

| Port | Region | Capacity | Berths |
|---|---|---|---|
| Shanghai | Asia | 45 | 30 |
| Singapore | Asia | 40 | 25 |
| Rotterdam | Europe | 35 | 22 |
| Los Angeles | North America | 30 | 18 |
| Dubai | Middle East | 28 | 20 |
| Santos | South America | 22 | 14 |
| Mumbai | Asia | 25 | 16 |
| Hamburg | Europe | 30 | 20 |

### Engineered Features

Beyond raw inputs, the system computes derived features:
- **Traffic Density**: `vessels_in_port / port_capacity`
- **Queue-Berth Ratio**: `queue_length / berth_count`
- **Arrival Pressure**: `(vessels + upcoming) / capacity`
- **Weather-Utilization Interaction**: `weather_severity × utilization`
- **Traffic-Labor Interaction**: `traffic_density × (1 - labor_availability)`

---

## 🤖 Model Details

### Architecture

| Component | Configuration |
|---|---|
| **Random Forest** | 200 trees, max_depth=10, balanced classes |
| **XGBoost** | 200 estimators, lr=0.1, subsample=0.8 |
| **Gradient Boosting** | 150 estimators, max_depth=5, lr=0.1 |
| **Ensemble** | Soft voting, weights=[1, 2, 1] (XGBoost prioritized) |

### Explainability

- **SHAP TreeExplainer** on the XGBoost model
- For each prediction, the top 5 contributing factors are identified
- Each factor includes:
  - Human-readable name
  - Impact level (High / Moderate / Low)
  - Direction (increasing/decreasing congestion risk)
  - Contextual detail (e.g., "Queue length of 10 vessels is above normal")

---

## 📈 Evaluation

### Metrics

The system evaluates models across multiple metrics:
- **Accuracy**: Overall correctness
- **Precision**: Positive predictive value
- **Recall**: Sensitivity to congestion events
- **F1 Score**: Harmonic mean of precision/recall
- **ROC AUC**: Area under the ROC curve

### Validation
- **5-fold stratified cross-validation** on the training set
- **Holdout test set** (20%) for unbiased evaluation
- Class balancing via `class_weight='balanced'` and XGBoost's `scale_pos_weight`

---

## 📐 Congestion Definition

A port is classified as **congested** when any of the following conditions are met:

1. **Composite Score > 0.55**: Weighted combination of:
   - Port utilization (25%)
   - Traffic ratio (20%)
   - Queue pressure (15%)
   - Weather severity (15%)
   - Seasonal factor (10%)
   - Labor constraint (10%)
   - Time-of-day factor (5%)

2. **Queue-to-Berth Ratio > 0.75**: More than 75% of berths have queued vessels

3. **Weather × Utilization**: Severe weather (severity > 0.6) with port utilization > 70%

---

## 📡 API Reference

### `POST /api/predict`
Predicts congestion for a given scenario.

**Request Body:**
```json
{
    "port_name": "Port of Shanghai",
    "vessel_type": "Container",
    "vessel_size_dwt": 65000,
    "vessels_in_port": 25,
    "queue_length": 8,
    "port_utilization_pct": 85,
    "weather_condition": "Rain",
    "wind_speed_knots": 20,
    "labor_availability_pct": 70,
    "month": 11,
    "hour_of_day": 8,
    "upcoming_arrivals_6h": 5,
    "historical_delay_rate": 0.3
}
```

**Response:**
```json
{
    "prediction": 1,
    "congestion_predicted": true,
    "congestion_probability": 0.7823,
    "confidence_score": 0.7823,
    "risk_level": "High",
    "estimated_delay_hours": 12.4,
    "explanations": [
        {
            "factor": "queue length",
            "impact": "High",
            "direction": "increasing",
            "shap_value": 0.8234,
            "detail": "Queue length of 8 vessels is above normal"
        }
    ]
}
```

### `GET /api/stats`
Returns dataset statistics, model performance, and analytics.

### `GET /api/ports`
Returns list of ports with their configurations and metrics.

---

## 🧩 Challenges Addressed

| Challenge | How It's Addressed |
|---|---|
| **Temporal dynamics** | Month, hour, day-of-week features + seasonal factors + peak season/hours flags |
| **Seasonality** | Q4 peak shipping season modeled with higher traffic density |
| **Noisy data** | Random noise added to synthetic data; robust ensemble reduces overfitting |
| **Port variability** | 8 diverse ports with different capacities, turnaround times, and regional characteristics |
| **Factor interaction** | Engineered interaction features: weather×utilization, traffic×labor |
| **Interpretability** | SHAP-based explanations with human-readable contextual descriptions |
| **Class imbalance** | Balanced class weights + XGBoost scale_pos_weight |

---

## 📁 Project Structure

```
aiqon_project/
├── README.md                    # This file
├── requirements.txt             # Python dependencies
├── generate_dataset.py          # Synthetic data generator
├── train_model.py               # ML training pipeline
├── app.py                       # Flask API server
├── data/
│   └── port_congestion_dataset.csv   # Generated dataset
├── models/
│   ├── ensemble_model.pkl       # Trained ensemble model
│   ├── xgboost_model.pkl        # XGBoost model (for SHAP)
│   ├── label_encoders.pkl       # Fitted label encoders
│   ├── scaler.pkl               # Fitted StandardScaler
│   └── model_metadata.json      # Model metrics & config
└── static/
    ├── index.html               # Dashboard page
    ├── style.css                # Design system & styles
    ├── app.js                   # Application logic
    └── plots/                   # Generated visualization plots
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **ML Models** | scikit-learn, XGBoost |
| **Explainability** | SHAP |
| **API** | Flask, Flask-CORS |
| **Frontend** | HTML5, CSS3, JavaScript |
| **Charts** | Chart.js |
| **Data** | pandas, numpy |

---

*Built for the Aiqon AI Internship Take-Home Assignment*
