"""
Synthetic Dataset Generator for Port Congestion Prediction
============================================================
Generates a realistic synthetic dataset (~400 records) simulating 
port operations across multiple ports with temporal, weather, 
operational, and traffic features.

Author: Aiqon AI Internship Assignment
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import os

np.random.seed(42)

# ─── Configuration ───────────────────────────────────────────────────────────

NUM_RECORDS = 400

PORTS = {
    "Port of Shanghai":    {"capacity": 45, "avg_turnaround_hrs": 28, "berths": 30, "region": "Asia"},
    "Port of Singapore":   {"capacity": 40, "avg_turnaround_hrs": 24, "berths": 25, "region": "Asia"},
    "Port of Rotterdam":   {"capacity": 35, "avg_turnaround_hrs": 30, "berths": 22, "region": "Europe"},
    "Port of Los Angeles": {"capacity": 30, "avg_turnaround_hrs": 32, "berths": 18, "region": "North America"},
    "Port of Dubai":       {"capacity": 28, "avg_turnaround_hrs": 26, "berths": 20, "region": "Middle East"},
    "Port of Santos":      {"capacity": 22, "avg_turnaround_hrs": 34, "berths": 14, "region": "South America"},
    "Port of Mumbai":      {"capacity": 25, "avg_turnaround_hrs": 36, "berths": 16, "region": "Asia"},
    "Port of Hamburg":     {"capacity": 30, "avg_turnaround_hrs": 28, "berths": 20, "region": "Europe"},
}

VESSEL_TYPES = ["Container", "Bulk Carrier", "Tanker", "Ro-Ro", "General Cargo"]
WEATHER_CONDITIONS = ["Clear", "Cloudy", "Rain", "Storm", "Fog", "High Winds"]

# ─── Helper Functions ────────────────────────────────────────────────────────

def generate_seasonal_factor(month):
    """Simulate seasonal congestion patterns — peak around Q4 (holiday shipping)"""
    seasonal = {
        1: 0.85, 2: 0.75, 3: 0.80, 4: 0.82, 5: 0.88, 6: 0.92,
        7: 0.95, 8: 1.00, 9: 1.05, 10: 1.15, 11: 1.20, 12: 1.10
    }
    return seasonal.get(month, 1.0)


def generate_time_of_day_factor(hour):
    """Port operations efficiency varies by time of day"""
    if 6 <= hour < 10:      # Morning rush
        return 1.15
    elif 10 <= hour < 16:   # Peak operational hours
        return 1.0
    elif 16 <= hour < 20:   # Evening transition
        return 1.10
    elif 20 <= hour < 24:   # Night shift
        return 0.85
    else:                   # Early morning (reduced staffing)
        return 0.70


def weather_severity_score(condition):
    """Map weather conditions to a severity score [0, 1]"""
    mapping = {
        "Clear": 0.0, "Cloudy": 0.1, "Rain": 0.35,
        "Fog": 0.5, "High Winds": 0.65, "Storm": 0.9
    }
    return mapping.get(condition, 0.0)


def compute_congestion_label(row):
    """
    Compute whether congestion occurs based on multiple interacting factors.
    
    Congestion is defined as:
        actual_turnaround > expected_turnaround * 1.3
        OR queue_length > berth_count * 0.75
        OR a composite congestion_score exceeds threshold
    
    Returns: (is_congested: bool, delay_hours: float, congestion_score: float)
    """
    # Base congestion score from utilization
    utilization = row["port_utilization_pct"] / 100.0
    traffic_ratio = row["vessels_in_port"] / row["berth_count"]
    queue_pressure = row["queue_length"] / max(row["berth_count"], 1)
    
    # Weather impact
    weather_impact = weather_severity_score(row["weather_condition"])
    
    # Seasonal and temporal
    seasonal = generate_seasonal_factor(row["month"])
    tod_factor = generate_time_of_day_factor(row["hour_of_day"])
    
    # Labor factor (fewer workers = more delay)
    labor_factor = 1.0 - (row["labor_availability_pct"] / 100.0) * 0.3
    
    # Composite congestion score (0 to 1 scale)
    congestion_score = (
        0.25 * utilization +
        0.20 * min(traffic_ratio, 1.0) +
        0.15 * min(queue_pressure, 1.0) +
        0.15 * weather_impact +
        0.10 * (seasonal - 0.7) / 0.5 +  # Normalize seasonal to ~0-1
        0.10 * labor_factor +
        0.05 * tod_factor * 0.5
    )
    
    # Add some noise
    congestion_score += np.random.normal(0, 0.05)
    congestion_score = np.clip(congestion_score, 0.0, 1.0)
    
    # Determine delay
    expected_turnaround = row["expected_turnaround_hrs"]
    delay_factor = max(0, congestion_score - 0.35) * 2.5
    delay_hours = expected_turnaround * delay_factor * np.random.uniform(0.5, 1.5)
    delay_hours = max(0, delay_hours)
    
    # Congestion threshold
    is_congested = (
        congestion_score > 0.55 or
        queue_pressure > 0.75 or
        (weather_impact > 0.6 and utilization > 0.7)
    )
    
    return is_congested, round(delay_hours, 1), round(congestion_score, 4)


# ─── Main Dataset Generation ─────────────────────────────────────────────────

def generate_dataset():
    """Generate the full synthetic dataset"""
    
    records = []
    start_date = datetime(2024, 1, 1)
    
    for i in range(NUM_RECORDS):
        # Random port selection
        port_name = np.random.choice(list(PORTS.keys()))
        port_info = PORTS[port_name]
        
        # Temporal features
        random_days = np.random.randint(0, 365)
        random_hours = np.random.randint(0, 24)
        arrival_time = start_date + timedelta(days=random_days, hours=random_hours)
        month = arrival_time.month
        day_of_week = arrival_time.weekday()  # 0=Monday
        hour_of_day = arrival_time.hour
        is_weekend = 1 if day_of_week >= 5 else 0
        
        # Vessel info
        vessel_type = np.random.choice(VESSEL_TYPES, p=[0.40, 0.25, 0.15, 0.10, 0.10])
        vessel_size_dwt = np.random.choice([
            np.random.randint(5000, 30000),     # Small
            np.random.randint(30000, 80000),    # Medium
            np.random.randint(80000, 200000),   # Large
        ], p=[0.3, 0.45, 0.25])
        
        # Seasonal adjustment for traffic
        seasonal = generate_seasonal_factor(month)
        
        # Port operational features
        base_vessels = int(port_info["berths"] * np.random.uniform(0.3, 1.2) * seasonal)
        vessels_in_port = max(1, base_vessels + np.random.randint(-3, 5))
        
        # Queue length correlates with traffic
        if vessels_in_port > port_info["berths"] * 0.8:
            queue_length = np.random.randint(2, 15)
        elif vessels_in_port > port_info["berths"] * 0.5:
            queue_length = np.random.randint(0, 6)
        else:
            queue_length = np.random.randint(0, 3)
        
        # Port utilization
        port_utilization = min(100, (vessels_in_port / port_info["berths"]) * 100 + np.random.normal(0, 8))
        port_utilization = max(10, port_utilization)
        
        # Weather (storms more likely in certain months)
        if month in [6, 7, 8, 9]:  # Monsoon/hurricane season
            weather_probs = [0.25, 0.20, 0.20, 0.15, 0.10, 0.10]
        elif month in [12, 1, 2]:   # Winter
            weather_probs = [0.30, 0.25, 0.15, 0.05, 0.15, 0.10]
        else:
            weather_probs = [0.45, 0.25, 0.15, 0.05, 0.05, 0.05]
        weather_condition = np.random.choice(WEATHER_CONDITIONS, p=weather_probs)
        
        # Wind speed (correlates with weather)
        base_wind = {"Clear": 8, "Cloudy": 12, "Rain": 18, "Fog": 6, "High Winds": 35, "Storm": 45}
        wind_speed_knots = max(0, base_wind[weather_condition] + np.random.normal(0, 5))
        
        # Tide height (affects large vessel access)
        tide_height_m = round(np.random.uniform(0.5, 4.5), 1)
        
        # Labor availability (lower on weekends and holidays)
        base_labor = 85 if not is_weekend else 65
        labor_availability = min(100, max(30, base_labor + np.random.normal(0, 10)))
        
        # Cargo volume
        cargo_volume_teu = int(np.random.uniform(500, 15000) * (vessel_size_dwt / 100000))
        
        # Expected turnaround time
        expected_turnaround = port_info["avg_turnaround_hrs"] + np.random.normal(0, 4)
        expected_turnaround = max(8, expected_turnaround)
        
        # Historical delay rate for this port (percentage of recent shipments delayed)
        historical_delay_rate = np.random.uniform(0.10, 0.45) * seasonal
        
        # Number of vessels arriving in the next 6 hours
        upcoming_arrivals = max(0, int(np.random.poisson(vessels_in_port * 0.15)))
        
        record = {
            "record_id": f"REC-{i+1:04d}",
            "arrival_time": arrival_time.strftime("%Y-%m-%d %H:%M"),
            "port_name": port_name,
            "port_region": port_info["region"],
            "berth_count": port_info["berths"],
            "port_capacity_vessels": port_info["capacity"],
            "vessel_type": vessel_type,
            "vessel_size_dwt": int(vessel_size_dwt),
            "cargo_volume_teu": cargo_volume_teu,
            "month": month,
            "day_of_week": day_of_week,
            "hour_of_day": hour_of_day,
            "is_weekend": is_weekend,
            "vessels_in_port": vessels_in_port,
            "queue_length": queue_length,
            "port_utilization_pct": round(port_utilization, 1),
            "weather_condition": weather_condition,
            "wind_speed_knots": round(wind_speed_knots, 1),
            "tide_height_m": tide_height_m,
            "labor_availability_pct": round(labor_availability, 1),
            "expected_turnaround_hrs": round(expected_turnaround, 1),
            "historical_delay_rate": round(historical_delay_rate, 3),
            "upcoming_arrivals_6h": upcoming_arrivals,
        }
        
        records.append(record)
    
    df = pd.DataFrame(records)
    
    # Compute labels
    labels = df.apply(compute_congestion_label, axis=1)
    df["is_congested"] = [l[0] for l in labels]
    df["delay_hours"] = [l[1] for l in labels]
    df["congestion_score"] = [l[2] for l in labels]
    
    # Convert boolean to int
    df["is_congested"] = df["is_congested"].astype(int)
    
    return df


if __name__ == "__main__":
    print("=" * 60)
    print("  Generating Synthetic Port Congestion Dataset")
    print("=" * 60)
    
    df = generate_dataset()
    
    # Save to CSV
    os.makedirs("data", exist_ok=True)
    output_path = os.path.join("data", "port_congestion_dataset.csv")
    df.to_csv(output_path, index=False)
    
    # Print summary statistics
    print(f"\n[OK] Generated {len(df)} records")
    print(f"[OK] Saved to: {output_path}")
    print(f"\n--- Dataset Summary ---")
    print(f"  Ports: {df['port_name'].nunique()}")
    print(f"  Date range: {df['arrival_time'].min()} to {df['arrival_time'].max()}")
    print(f"  Congested records: {df['is_congested'].sum()} ({df['is_congested'].mean()*100:.1f}%)")
    print(f"  Non-congested: {(1-df['is_congested']).sum()} ({(1-df['is_congested']).mean()*100:.1f}%)")
    print(f"  Avg delay (congested): {df[df['is_congested']==1]['delay_hours'].mean():.1f} hrs")
    print(f"  Avg delay (non-congested): {df[df['is_congested']==0]['delay_hours'].mean():.1f} hrs")
    print(f"\n--- Feature Columns ({len(df.columns)}) ---")
    for col in df.columns:
        print(f"  - {col}: {df[col].dtype}")
    print()
