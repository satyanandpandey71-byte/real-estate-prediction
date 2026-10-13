"""
generate_data.py
Creates a realistic synthetic real-estate dataset (5,000 listings across Indian cities)
and loads it into a SQLite database (SQL component of the project).

Replace data/properties.csv with a real dataset (e.g. Kaggle "House price India")
that has the same columns to train on real data.
"""
import os
import sqlite3
import numpy as np
import pandas as pd

RNG = np.random.default_rng(42)
N = 5000

# city -> (base price per sq ft in INR, localities with a multiplier)
CITIES = {
    "Mumbai":     (21000, {"Bandra": 1.8, "Andheri": 1.2, "Powai": 1.3, "Thane": 0.75, "Navi Mumbai": 0.7}),
    "Delhi":      (11500, {"Dwarka": 0.8, "Saket": 1.5, "Rohini": 0.75, "Vasant Kunj": 1.7, "Laxmi Nagar": 0.7}),
    "Bangalore":  (8500,  {"Whitefield": 1.0, "Koramangala": 1.6, "HSR Layout": 1.3, "Electronic City": 0.7, "Hebbal": 1.1}),
    "Hyderabad":  (6500,  {"Gachibowli": 1.5, "Madhapur": 1.4, "Kukatpally": 0.9, "Miyapur": 0.75, "Banjara Hills": 1.9}),
    "Chennai":    (7000,  {"Adyar": 1.5, "OMR": 1.0, "Tambaram": 0.7, "Anna Nagar": 1.4, "Velachery": 1.1}),
    "Pune":       (7500,  {"Kothrud": 1.3, "Hinjewadi": 1.0, "Wakad": 1.05, "Hadapsar": 0.9, "Baner": 1.4}),
    "Chandigarh": (6800,  {"Sector 17": 1.5, "Mohali": 0.85, "Zirakpur": 0.7, "Panchkula": 0.95, "Sector 35": 1.3}),
    "Kolkata":    (6200,  {"Salt Lake": 1.3, "New Town": 1.1, "Behala": 0.75, "Howrah": 0.6, "Ballygunge": 1.7}),
}
PROPERTY_TYPES = ["Apartment", "Independent House", "Villa", "Builder Floor"]
FURNISHING = ["Unfurnished", "Semi-Furnished", "Furnished"]
AMENITY_COLS = ["gym", "swimming_pool", "parking", "security", "lift", "garden", "clubhouse", "power_backup"]


def generate() -> pd.DataFrame:
    rows = []
    city_names = list(CITIES.keys())
    for i in range(N):
        city = RNG.choice(city_names, p=[0.15, 0.15, 0.17, 0.12, 0.10, 0.12, 0.09, 0.10])
        base_ppsf, localities = CITIES[city]
        locality = RNG.choice(list(localities.keys()))
        loc_mult = localities[locality]

        ptype = RNG.choice(PROPERTY_TYPES, p=[0.55, 0.15, 0.1, 0.2])
        bhk = int(RNG.choice([1, 2, 3, 4, 5], p=[0.12, 0.35, 0.33, 0.16, 0.04]))
        if ptype == "Villa":
            bhk = max(bhk, 3)

        area = int(np.clip(RNG.normal(350 + bhk * 320, 120), 300, 6000))
        bathrooms = int(np.clip(bhk + RNG.integers(-1, 2), 1, 6))
        age = int(RNG.integers(0, 31))
        floor = 0 if ptype in ("Independent House", "Villa") else int(RNG.integers(0, 25))
        total_floors = max(floor, int(RNG.integers(floor, floor + 8))) if floor else int(RNG.integers(1, 4))
        furnishing = RNG.choice(FURNISHING, p=[0.35, 0.4, 0.25])
        metro_km = round(float(np.clip(RNG.exponential(3.0), 0.1, 20)), 1)
        amen = {c: int(RNG.random() < p) for c, p in zip(
            AMENITY_COLS, [0.4, 0.2, 0.85, 0.75, 0.6, 0.35, 0.25, 0.7])}
        if ptype in ("Independent House", "Villa"):
            amen["lift"] = 0

        # ---- price model (hidden ground truth + noise) ----
        ppsf = base_ppsf * loc_mult
        ppsf *= {"Apartment": 1.0, "Independent House": 0.95, "Villa": 1.25, "Builder Floor": 0.97}[ptype]
        ppsf *= (1 - 0.007 * age)                                  # depreciation
        ppsf *= {"Unfurnished": 1.0, "Semi-Furnished": 1.05, "Furnished": 1.12}[furnishing]
        ppsf *= (1 + 0.03 * min(floor, 15) / 15)                   # higher floor premium
        ppsf *= (1 - 0.012 * min(metro_km, 10))                    # metro proximity
        ppsf *= (1 + 0.02 * sum(amen.values()))                    # amenities
        ppsf *= (1 + 0.015 * (bathrooms - 1))
        price = area * ppsf * RNG.lognormal(0, 0.08)               # market noise
        rows.append({
            "property_id": i + 1, "city": city, "locality": locality, "property_type": ptype,
            "bhk": bhk, "area_sqft": area, "bathrooms": bathrooms, "age_years": age,
            "floor": floor, "total_floors": total_floors, "furnishing": furnishing,
            "metro_distance_km": metro_km, **amen, "price_inr": int(round(price, -3)),
        })
    return pd.DataFrame(rows)


def main():
    os.makedirs("data", exist_ok=True)
    df = generate()
    df.to_csv("data/properties.csv", index=False)

    # Load into SQL database
    conn = sqlite3.connect("data/real_estate.db")
    df.to_sql("properties", conn, if_exists="replace", index=False)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_city ON properties(city)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_price ON properties(price_inr)")
    conn.commit()
    conn.close()
    print(f"Generated {len(df)} listings -> data/properties.csv and data/real_estate.db")
    print(df.head())


if __name__ == "__main__":
    main()
