"""
api.py - Flask REST API
Run:  python api.py        (serves on http://localhost:5000)

POST /predict    -> predicted price
POST /recommend  -> top-N recommended properties
GET  /market     -> city-wise market summary
GET  /health
"""
from flask import Flask, jsonify, request
import predictor

app = Flask(__name__)

REQUIRED = ["city", "locality", "property_type", "furnishing", "bhk", "area_sqft",
            "bathrooms", "age_years"]


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.post("/predict")
def predict():
    data = request.get_json(silent=True) or {}
    missing = [k for k in REQUIRED if k not in data]
    if missing:
        return jsonify(error=f"Missing fields: {missing}"), 400
    return jsonify(predictor.predict_price(data))


@app.post("/recommend")
def recommend():
    data = request.get_json(silent=True) or {}
    top_n = int(data.pop("top_n", 5))
    df = predictor.recommend(data, top_n=top_n)
    return jsonify(df.to_dict(orient="records"))


@app.get("/market")
def market():
    return jsonify(predictor.market_summary().to_dict(orient="records"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
