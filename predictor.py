"""
predictor.py
Shared logic: price prediction + content/preference-based recommendation engine + SQL queries.
Used by both the Flask API and the Streamlit app.
"""
import json
import sqlite3
import joblib
import numpy as np
import pandas as pd

MODEL_PATH = "models/price_model.joblib"
META_PATH = "models/model_meta.json"
DB_PATH = "data/real_estate.db"

_model = None
_meta = None


def _load():
    global _model, _meta
    if _model is None:
        _model = joblib.load(MODEL_PATH)
        _meta = json.load(open(META_PATH))
    return _model, _meta


def predict_price(features: dict) -> dict:
    """Predict price in INR with an approximate 90% interval (from log-residual std)."""
    model, meta = _load()
    cols = meta["cat_features"] + meta["num_features"]
    row = {c: features.get(c, 0) for c in cols}
    X = pd.DataFrame([row])
    log_p = float(model.predict(X)[0])
    s = meta["resid_std_log"]
    price = float(np.expm1(log_p))
    return {
        "predicted_price": round(price, -3),
        "lower_bound": round(float(np.expm1(log_p - 1.645 * s)), -3),
        "upper_bound": round(float(np.expm1(log_p + 1.645 * s)), -3),
        "price_per_sqft": round(price / max(features.get("area_sqft", 1), 1)),
    }


def get_listings(filters: dict | None = None) -> pd.DataFrame:
    """Parameterised SQL query against the listings table."""
    filters = filters or {}
    q, params = "SELECT * FROM properties WHERE 1=1", []
    if filters.get("city"):
        q += " AND city = ?"; params.append(filters["city"])
    if filters.get("locality"):
        q += " AND locality = ?"; params.append(filters["locality"])
    if filters.get("property_type"):
        q += " AND property_type = ?"; params.append(filters["property_type"])
    if filters.get("bhk"):
        q += " AND bhk >= ?"; params.append(int(filters["bhk"]))
    if filters.get("min_area"):
        q += " AND area_sqft >= ?"; params.append(int(filters["min_area"]))
    if filters.get("max_price"):
        q += " AND price_inr <= ?"; params.append(int(filters["max_price"]))
    if filters.get("min_price"):
        q += " AND price_inr >= ?"; params.append(int(filters["min_price"]))
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(q, conn, params=params)
    conn.close()
    return df


def recommend(prefs: dict, top_n: int = 5) -> pd.DataFrame:
    """
    Recommend properties for a user.
    1. Hard filters (SQL): city, budget, minimum BHK, property type.
    2. Soft scoring (0-100): budget fit, area fit, locality match, amenities,
       metro proximity, age, and value-for-money (model-predicted price vs listed price).
    """
    model, meta = _load()
    df = get_listings({
        "city": prefs.get("city"), "property_type": prefs.get("property_type"),
        "bhk": prefs.get("bhk"), "max_price": prefs.get("max_budget"),
        "min_price": prefs.get("min_budget"),
    })
    if df.empty:
        return df

    cols = meta["cat_features"] + meta["num_features"]
    df["fair_price"] = np.expm1(model.predict(df[cols])).round(-3)
    df["value_gap_pct"] = ((df["fair_price"] - df["price_inr"]) / df["fair_price"] * 100).round(1)

    score = np.zeros(len(df))
    w = {"budget": 25, "value": 20, "area": 15, "locality": 10, "amenity": 15, "metro": 10, "age": 5}

    max_b = prefs.get("max_budget")
    if max_b:
        # best when price is 75-100% of budget; far below budget slightly less preferred
        ratio = df["price_inr"] / max_b
        score += w["budget"] * np.clip(1 - np.abs(ratio - 0.9) / 0.9, 0, 1)
    else:
        score += w["budget"] * 0.5

    score += w["value"] * np.clip((df["value_gap_pct"] + 10) / 30, 0, 1)  # undervalued -> higher

    if prefs.get("min_area"):
        score += w["area"] * np.clip(df["area_sqft"] / (prefs["min_area"] * 1.2), 0, 1)
    else:
        score += w["area"] * 0.5

    if prefs.get("locality"):
        score += w["locality"] * (df["locality"] == prefs["locality"]).astype(float)
    else:
        score += w["locality"] * 0.5

    wanted = [a for a in prefs.get("amenities", []) if a in df.columns]
    score += w["amenity"] * (df[wanted].mean(axis=1) if wanted else 0.5)

    score += w["metro"] * np.clip(1 - df["metro_distance_km"] / 10, 0, 1)
    score += w["age"] * np.clip(1 - df["age_years"] / 30, 0, 1)

    df["match_score"] = score.round(1)
    out = df.sort_values("match_score", ascending=False).head(top_n)
    keep = ["property_id", "city", "locality", "property_type", "bhk", "area_sqft", "bathrooms",
            "age_years", "furnishing", "metro_distance_km", "price_inr", "fair_price",
            "value_gap_pct", "match_score"]
    return out[keep].reset_index(drop=True)


def market_summary() -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        """SELECT city, COUNT(*) AS listings, ROUND(AVG(price_inr)/1e5,1) AS avg_price_lakh,
                  ROUND(AVG(price_inr*1.0/area_sqft)) AS avg_price_per_sqft
           FROM properties GROUP BY city ORDER BY avg_price_per_sqft DESC""", conn)
    conn.close()
    return df
