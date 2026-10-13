# Real Estate Price Prediction and Recommendation System

Predicts property prices (Linear, Ridge, Random Forest, Gradient Boosting, XGBoost) and recommends
properties by user preferences. SQL (SQLite) + Flask API + Streamlit web app.

## Run
```bash
pip install -r requirements.txt
python generate_data.py     # creates data/properties.csv and data/real_estate.db (synthetic data)
python train_model.py       # trains models, saves models/price_model.joblib and charts in outputs/
streamlit run app.py        # web app at http://localhost:8501
python api.py               # REST API at http://localhost:5000
```

## API
- `GET /health`
- `POST /predict` - needs city, locality, property_type, furnishing, bhk, area_sqft, bathrooms, age_years
  (optional: floor, total_floors, metro_distance_km, gym, swimming_pool, parking, security, lift, garden, clubhouse, power_backup)
- `POST /recommend` - city, bhk, min_area, min_budget, max_budget, locality, property_type, amenities[], top_n
- `GET /market`

## Using real data
The bundled dataset is synthetic. To use real listings, put a CSV with the same columns in `data/properties.csv`,
load it into SQLite (the last lines of `generate_data.py` show how), then rerun `train_model.py`.
Reported accuracy on synthetic data will be higher than on real data.

## Report
`Project_Report.docx` follows the college report format. Placeholders in [ square brackets ]
(college logo, degree, organization, guide) must be filled in. `python make_report_assets.py && node build_report.js`
rebuilds it from the latest results.

## AWS deployment
See Appendix 4 of the report, or use the included `Dockerfile`:
```bash
docker build -t realestate . && docker run -p 8501:8501 realestate
```
