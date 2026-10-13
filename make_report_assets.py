"""Builds the architecture diagram and a JSON of real results used by the report."""
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import pandas as pd
import predictor

# ---------- architecture diagram ----------
fig, ax = plt.subplots(figsize=(11, 5))
ax.set_xlim(0, 11); ax.set_ylim(0, 5); ax.axis("off")


def box(x, y, w, h, text, fc="#dbeaf3"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.05,rounding_size=0.12",
                                fc=fc, ec="#2a6f97", lw=1.5))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=9.5)


def arrow(x1, y1, x2, y2):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle="-|>", mutation_scale=14, color="#333", lw=1.4))


box(0.2, 3.6, 2.2, 0.9, "Property data\n(CSV listings)")
box(0.2, 2.2, 2.2, 0.9, "SQLite / SQL\nlistings database")
box(3.1, 3.6, 2.4, 0.9, "Preprocessing\nencoding, log-price")
box(3.1, 2.2, 2.4, 0.9, "Model training\nLinear, Ridge, RF,\nGB, XGBoost", fc="#c7e3d0")
box(3.1, 0.7, 2.4, 0.9, "Best model\n(price_model.joblib)", fc="#c7e3d0")
box(6.2, 2.9, 2.2, 1.0, "Recommendation\nengine (filter + score)", fc="#f8e5c0")
box(6.2, 1.2, 2.2, 1.0, "Flask REST API\n/predict /recommend", fc="#f8e5c0")
box(8.9, 2.05, 1.9, 1.1, "Streamlit web UI\n(user)", fc="#f3d1d1")
box(8.9, 0.4, 1.9, 0.9, "AWS EC2\ndeployment", fc="#e6e6e6")
arrow(1.3, 3.6, 1.3, 3.1); arrow(2.4, 4.05, 3.1, 4.05); arrow(2.4, 2.65, 3.1, 2.65)
arrow(4.3, 3.6, 4.3, 3.1); arrow(4.3, 2.2, 4.3, 1.6)
arrow(5.5, 1.15, 6.2, 1.55); arrow(5.5, 1.3, 6.2, 3.2); ax.plot([1.3, 1.3, 5.8, 5.8], [2.2, 1.9, 1.9, 3.15], color="#333", lw=1.4)
arrow(5.8, 3.15, 6.2, 3.3)
arrow(8.4, 3.3, 8.9, 2.9); arrow(8.4, 1.7, 8.9, 2.3); arrow(9.85, 2.05, 9.85, 1.3)
ax.set_title("System architecture", fontsize=12)
plt.tight_layout(); plt.savefig("outputs/fig_architecture.png", dpi=150); plt.close()

# ---------- real results ----------
sample_in = {"city": "Bangalore", "locality": "Whitefield", "property_type": "Apartment",
             "furnishing": "Semi-Furnished", "bhk": 3, "area_sqft": 1500, "bathrooms": 3, "age_years": 4,
             "floor": 8, "total_floors": 15, "metro_distance_km": 2.5, "parking": 1, "security": 1,
             "lift": 1, "gym": 1}
sample_out = predictor.predict_price(sample_in)
prefs = {"city": "Pune", "bhk": 2, "min_area": 800, "min_budget": 4e6, "max_budget": 9e6,
         "amenities": ["parking", "security"], "locality": "Baner"}
rec = predictor.recommend(prefs, 5)
df = pd.read_csv("data/properties.csv")
out = {
    "sample_in": sample_in, "sample_out": sample_out, "prefs": prefs,
    "rec": rec.to_dict(orient="records"),
    "market": predictor.market_summary().to_dict(orient="records"),
    "n_rows": len(df), "n_cols": df.shape[1],
    "price_min": int(df.price_inr.min()), "price_max": int(df.price_inr.max()),
    "price_mean": float(df.price_inr.mean()), "price_median": float(df.price_inr.median()),
    "area_mean": float(df.area_sqft.mean()),
}
json.dump(out, open("outputs/report_data.json", "w"), indent=2, default=float)
print(json.dumps(out["sample_out"]), out["n_rows"], out["price_median"])
