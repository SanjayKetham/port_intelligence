"""
Flask API Server for Port Congestion Prediction
=================================================
Serves the trained ML model via REST API with:
  - Prediction endpoint with confidence scores
  - SHAP-based explanation for each prediction
  - Dataset statistics & analytics endpoints
  - Static file serving for the web dashboard

Author: Aiqon AI Internship Assignment
"""

import os
import json
import sqlite3
import secrets
import numpy as np
import pandas as pd
import joblib
import shap
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# ─── App Setup ───────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)

MODEL_DIR = "models"
DATA_PATH = os.path.join("data", "port_congestion_dataset.csv")
DB_PATH = os.path.join("data", "auth.db")

# ─── Auth Database Setup ─────────────────────────────────────────────────────

def init_auth_db():
    os.makedirs("data", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'operator',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')
    # Seed default demo admin user
    c.execute("SELECT id FROM users WHERE email = 'admin@aiqon.io'")
    if not c.fetchone():
        hashed = generate_password_hash("admin123")
        c.execute("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                  ("Captain Sanjay", "admin@aiqon.io", hashed, "Senior Fleet Director"))
    conn.commit()
    conn.close()

init_auth_db()

def get_user_by_token(token):
    if not token:
        return None
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT u.id, u.name, u.email, u.role
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
    ''', (token,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"id": row[0], "name": row[1], "email": row[2], "role": row[3]}
    return None

# ─── Load Artifacts ──────────────────────────────────────────────────────────

print("Loading model artifacts...")
ensemble_model = joblib.load(os.path.join(MODEL_DIR, "ensemble_model.pkl"))
xgb_model = joblib.load(os.path.join(MODEL_DIR, "xgboost_model.pkl"))
label_encoders = joblib.load(os.path.join(MODEL_DIR, "label_encoders.pkl"))
scaler = joblib.load(os.path.join(MODEL_DIR, "scaler.pkl"))

with open(os.path.join(MODEL_DIR, "model_metadata.json"), "r") as f:
    metadata = json.load(f)

# Load dataset for analytics
df = pd.read_csv(DATA_PATH)

# SHAP explainer
shap_explainer = shap.TreeExplainer(xgb_model)

print("[OK] All artifacts loaded successfully")


# ─── Feature Engineering (mirrors train_model.py) ───────────────────────────

CATEGORICAL_FEATURES = ["port_name", "vessel_type", "weather_condition", "port_region"]
NUMERICAL_FEATURES = [
    "berth_count", "port_capacity_vessels", "vessel_size_dwt", "cargo_volume_teu",
    "month", "day_of_week", "hour_of_day", "is_weekend",
    "vessels_in_port", "queue_length", "port_utilization_pct",
    "wind_speed_knots", "tide_height_m", "labor_availability_pct",
    "expected_turnaround_hrs", "historical_delay_rate", "upcoming_arrivals_6h"
]

# Port configurations for lookups
PORT_CONFIGS = {
    "Port of Shanghai":    {"capacity": 45, "avg_turnaround_hrs": 28, "berths": 30, "region": "Asia"},
    "Port of Singapore":   {"capacity": 40, "avg_turnaround_hrs": 24, "berths": 25, "region": "Asia"},
    "Port of Rotterdam":   {"capacity": 35, "avg_turnaround_hrs": 30, "berths": 22, "region": "Europe"},
    "Port of Los Angeles": {"capacity": 30, "avg_turnaround_hrs": 32, "berths": 18, "region": "North America"},
    "Port of Dubai":       {"capacity": 28, "avg_turnaround_hrs": 26, "berths": 20, "region": "Middle East"},
    "Port of Santos":      {"capacity": 22, "avg_turnaround_hrs": 34, "berths": 14, "region": "South America"},
    "Port of Mumbai":      {"capacity": 25, "avg_turnaround_hrs": 36, "berths": 16, "region": "Asia"},
    "Port of Hamburg":     {"capacity": 30, "avg_turnaround_hrs": 28, "berths": 20, "region": "Europe"},
}


def prepare_input(data):
    """Transform API input into model-ready features"""
    
    port_name = data.get("port_name", "Port of Shanghai")
    port = PORT_CONFIGS.get(port_name, PORT_CONFIGS["Port of Shanghai"])
    
    # Build feature dict
    record = {
        "port_name": port_name,
        "port_region": port["region"],
        "berth_count": port["berths"],
        "port_capacity_vessels": port["capacity"],
        "vessel_type": data.get("vessel_type", "Container"),
        "vessel_size_dwt": data.get("vessel_size_dwt", 50000),
        "cargo_volume_teu": data.get("cargo_volume_teu", 3000),
        "month": data.get("month", 6),
        "day_of_week": data.get("day_of_week", 2),
        "hour_of_day": data.get("hour_of_day", 10),
        "is_weekend": data.get("is_weekend", 0),
        "vessels_in_port": data.get("vessels_in_port", 15),
        "queue_length": data.get("queue_length", 3),
        "port_utilization_pct": data.get("port_utilization_pct", 70),
        "weather_condition": data.get("weather_condition", "Clear"),
        "wind_speed_knots": data.get("wind_speed_knots", 10),
        "tide_height_m": data.get("tide_height_m", 2.5),
        "labor_availability_pct": data.get("labor_availability_pct", 80),
        "expected_turnaround_hrs": data.get("expected_turnaround_hrs", port["avg_turnaround_hrs"]),
        "historical_delay_rate": data.get("historical_delay_rate", 0.25),
        "upcoming_arrivals_6h": data.get("upcoming_arrivals_6h", 3),
    }
    
    row = pd.DataFrame([record])
    
    # Engineer derived features
    row["traffic_density"] = row["vessels_in_port"] / row["port_capacity_vessels"]
    row["queue_berth_ratio"] = row["queue_length"] / row["berth_count"]
    row["arrival_pressure"] = (row["vessels_in_port"] + row["upcoming_arrivals_6h"]) / row["port_capacity_vessels"]
    
    weather_severity_map = {"Clear": 0, "Cloudy": 1, "Rain": 2, "Fog": 3, "High Winds": 4, "Storm": 5}
    row["weather_severity"] = row["weather_condition"].map(weather_severity_map)
    row["weather_utilization_interaction"] = row["weather_severity"] * row["port_utilization_pct"] / 100
    row["traffic_labor_interaction"] = row["traffic_density"] * (100 - row["labor_availability_pct"]) / 100
    row["is_peak_season"] = (row["month"].isin([10, 11, 12])).astype(int)
    row["is_peak_hours"] = ((row["hour_of_day"] >= 6) & (row["hour_of_day"] < 10)).astype(int)
    
    # Encode categoricals
    for col in CATEGORICAL_FEATURES:
        row[col + "_encoded"] = label_encoders[col].transform(row[col])
    
    engineered_features = [
        "traffic_density", "queue_berth_ratio", "arrival_pressure",
        "weather_severity", "weather_utilization_interaction",
        "traffic_labor_interaction", "is_peak_season", "is_peak_hours"
    ]
    all_numerical = NUMERICAL_FEATURES + engineered_features
    encoded_features = [col + "_encoded" for col in CATEGORICAL_FEATURES]
    feature_cols = all_numerical + encoded_features
    
    X = row[feature_cols].copy()
    X[all_numerical] = scaler.transform(X[all_numerical])
    
    return X, record, feature_cols


def generate_explanation(shap_values, feature_names, record):
    """Generate human-readable explanation from SHAP values"""
    
    # Get top contributing factors
    shap_dict = dict(zip(feature_names, shap_values[0]))
    sorted_factors = sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)
    
    explanations = []
    human_readable = {
        "port_utilization_pct": "port utilization",
        "queue_length": "queue length",
        "vessels_in_port": "vessel traffic",
        "traffic_density": "traffic density",
        "queue_berth_ratio": "queue-to-berth ratio",
        "weather_severity": "weather conditions",
        "wind_speed_knots": "wind speed",
        "labor_availability_pct": "labor availability",
        "arrival_pressure": "arrival pressure",
        "historical_delay_rate": "historical delay patterns",
        "upcoming_arrivals_6h": "upcoming vessel arrivals",
        "cargo_volume_teu": "cargo volume",
        "vessel_size_dwt": "vessel size",
        "weather_utilization_interaction": "weather-utilization interaction",
        "traffic_labor_interaction": "traffic-labor dynamics",
        "is_peak_season": "peak season",
        "is_peak_hours": "peak hours",
        "expected_turnaround_hrs": "expected turnaround time",
        "berth_count": "berth availability",
        "port_capacity_vessels": "port capacity",
        "tide_height_m": "tide conditions",
        "month": "time of year",
        "hour_of_day": "time of day",
        "day_of_week": "day of week",
        "is_weekend": "weekend operations",
        "port_name_encoded": "port characteristics",
        "vessel_type_encoded": "vessel type",
        "weather_condition_encoded": "weather type",
        "port_region_encoded": "port region",
    }
    
    for feat, shap_val in sorted_factors[:5]:
        name = human_readable.get(feat, feat)
        direction = "increasing" if shap_val > 0 else "decreasing"
        impact = "High" if abs(shap_val) > 0.5 else "Moderate" if abs(shap_val) > 0.2 else "Low"
        
        # Build contextual explanation
        if feat == "queue_length" and record.get("queue_length", 0) > 5:
            detail = f"Queue length of {record['queue_length']} vessels is above normal"
        elif feat == "port_utilization_pct" and record.get("port_utilization_pct", 0) > 80:
            detail = f"Port utilization at {record['port_utilization_pct']}% is near capacity"
        elif feat == "vessels_in_port" and record.get("vessels_in_port", 0) > 20:
            detail = f"High vessel traffic ({record['vessels_in_port']} vessels in port)"
        elif feat in ("weather_severity", "weather_condition_encoded"):
            detail = f"Weather condition: {record.get('weather_condition', 'Unknown')}"
        elif feat == "labor_availability_pct" and record.get("labor_availability_pct", 100) < 70:
            detail = f"Labor availability at {record['labor_availability_pct']}% is constrained"
        elif feat == "wind_speed_knots" and record.get("wind_speed_knots", 0) > 25:
            detail = f"Wind speed of {record['wind_speed_knots']} knots may affect operations"
        else:
            # Generic value description
            val = record.get(feat, None)
            if val is not None:
                detail = f"{name.capitalize()} = {val}"
            else:
                detail = f"{name.capitalize()} is {direction} congestion likelihood"
        
        explanations.append({
            "factor": name,
            "impact": impact,
            "direction": direction,
            "shap_value": round(float(shap_val), 4),
            "detail": detail
        })
    
    return explanations


# ─── API Routes ──────────────────────────────────────────────────────────────

@app.route('/')
def index():
    """Serve the main dashboard"""
    return send_from_directory('static', 'index.html')


# ─── Authentication Routes ───────────────────────────────────────────────────

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """Register a new user account"""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not name or not email or not password:
        return jsonify({"error": "Full name, email address, and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        password_hash = generate_password_hash(password)
        c.execute("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
                  (name, email, password_hash, "Fleet Analyst"))
        user_id = c.lastrowid
        token = secrets.token_hex(24)
        c.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
        conn.commit()
        return jsonify({
            "success": True,
            "token": token,
            "user": {"id": user_id, "name": name, "email": email, "role": "Fleet Analyst"}
        })
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email address already exists"}), 409
    finally:
        conn.close()


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate user with email and password"""
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '').strip()

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, name, email, password_hash, role FROM users WHERE email = ?", (email,))
    row = c.fetchone()
    if not row or not check_password_hash(row[3], password):
        conn.close()
        return jsonify({"error": "Invalid email or password"}), 401

    user_id, name, email, _, role = row
    token = secrets.token_hex(24)
    c.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "token": token,
        "user": {"id": user_id, "name": name, "email": email, "role": role}
    })


@app.route('/api/auth/me', methods=['GET'])
def get_me():
    """Check current authenticated session"""
    auth_header = request.headers.get('Authorization', '')
    token = ''
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
    elif 'token' in request.args:
        token = request.args.get('token')

    user = get_user_by_token(token)
    if not user:
        return jsonify({"authenticated": False}), 401
    return jsonify({"authenticated": True, "user": user})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """End current session"""
    auth_header = request.headers.get('Authorization', '')
    token = ''
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
    if token:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    return jsonify({"success": True})


@app.route('/api/predict', methods=['POST'])
@app.route('/api/detect', methods=['POST'])
def predict():
    """
    Predict congestion likelihood for a given shipment/port scenario.
    
    Returns:
        - prediction (0/1)
        - confidence_score (0-1)
        - congestion_probability (0-1)
        - risk_level (Low/Medium/High/Critical)
        - explanations (top 5 contributing factors)
        - estimated_delay_hours
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No input data provided"}), 400
        
        # Prepare features
        X, record, feature_names = prepare_input(data)
        
        # Predict
        prediction = int(ensemble_model.predict(X)[0])
        probabilities = ensemble_model.predict_proba(X)[0]
        congestion_probability = float(probabilities[1])
        confidence_score = float(max(probabilities))
        
        # Risk level
        if congestion_probability < 0.25:
            risk_level = "Low"
        elif congestion_probability < 0.50:
            risk_level = "Medium"
        elif congestion_probability < 0.75:
            risk_level = "High"
        else:
            risk_level = "Critical"
        
        # Estimated delay
        if prediction == 1:
            base_delay = record["expected_turnaround_hrs"] * 0.3
            estimated_delay = base_delay * congestion_probability * 2
        else:
            estimated_delay = max(0, (congestion_probability - 0.2) * record["expected_turnaround_hrs"] * 0.15)
        
        # SHAP explanations
        shap_values = shap_explainer.shap_values(X)
        explanations = generate_explanation(shap_values, feature_names, record)
        
        response = {
            "prediction": prediction,
            "congestion_predicted": bool(prediction),
            "congestion_probability": round(congestion_probability, 4),
            "confidence_score": round(confidence_score, 4),
            "risk_level": risk_level,
            "estimated_delay_hours": round(estimated_delay, 1),
            "explanations": explanations,
            "input_summary": {
                "port": record["port_name"],
                "vessel_type": record["vessel_type"],
                "weather": record["weather_condition"],
                "utilization": record["port_utilization_pct"],
                "queue_length": record["queue_length"],
                "vessels_in_port": record["vessels_in_port"],
            }
        }
        
        return jsonify(response)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Return dataset statistics and model performance metrics"""
    try:
        stats = {
            "dataset": metadata["dataset_stats"],
            "model_performance": metadata["evaluation_results"],
            "cv_scores": metadata["cv_scores"],
            "feature_importance": metadata["feature_importance"][:15],
            "port_analytics": metadata["port_configs"],
        }
        
        # Monthly trends
        monthly = df.groupby('month').agg({
            'is_congested': 'mean',
            'delay_hours': 'mean',
            'congestion_score': 'mean'
        }).reset_index()
        stats["monthly_trends"] = monthly.to_dict(orient='records')
        
        # Weather impact
        weather = df.groupby('weather_condition').agg({
            'is_congested': 'mean',
            'delay_hours': 'mean'
        }).reset_index()
        stats["weather_impact"] = weather.to_dict(orient='records')
        
        # Vessel type analysis
        vessel = df.groupby('vessel_type').agg({
            'is_congested': 'mean',
            'delay_hours': 'mean'
        }).reset_index()
        stats["vessel_analysis"] = vessel.to_dict(orient='records')
        
        return jsonify(stats)
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/ports', methods=['GET'])
def get_ports():
    """Return list of available ports with their configurations"""
    ports = []
    for name, config in PORT_CONFIGS.items():
        port_data = df[df["port_name"] == name]
        ports.append({
            "name": name,
            "region": config["region"],
            "capacity": config["capacity"],
            "berths": config["berths"],
            "avg_turnaround_hrs": config["avg_turnaround_hrs"],
            "congestion_rate": round(float(port_data["is_congested"].mean()), 4) if len(port_data) > 0 else 0,
            "avg_delay": round(float(port_data["delay_hours"].mean()), 2) if len(port_data) > 0 else 0,
        })
    return jsonify(ports)


@app.route('/api/dataset/sample', methods=['GET'])
def get_sample():
    """Return a sample of the dataset"""
    n = min(int(request.args.get('n', 20)), 50)
    sample = df.sample(n=n, random_state=42).to_dict(orient='records')
    return jsonify(sample)


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    print("\n" + "=" * 60)
    print("  Port Congestion Prediction API")
    print(f"  http://localhost:{port}")
    print("=" * 60 + "\n")
    app.run(host='0.0.0.0', port=port, debug=debug)

