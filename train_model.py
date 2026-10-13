"""
train_model.py
EDA charts, model training (Linear, Ridge, Random Forest, Gradient Boosting, XGBoost),
evaluation with MAE / RMSE / R2 / MAPE, 5-fold CV, and charts. Saves the best model.
"""
import json
import os
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import cross_val_score, train_test_split, KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from xgboost import XGBRegressor

sns.set_theme(style="whitegrid")
os.makedirs("models", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

CAT = ["city", "locality", "property_type", "furnishing"]
NUM = ["bhk", "area_sqft", "bathrooms", "age_years", "floor", "total_floors", "metro_distance_km",
       "gym", "swimming_pool", "parking", "security", "lift", "garden", "clubhouse", "power_backup"]
TARGET = "price_inr"


def eda(df):
    fig, ax = plt.subplots(1, 2, figsize=(12, 4))
    sns.histplot(df[TARGET] / 1e7, bins=50, kde=True, ax=ax[0], color="#2a6f97")
    ax[0].set_title("Price distribution (INR crore)"); ax[0].set_xlabel("Price (crore)")
    sns.histplot(np.log1p(df[TARGET]), bins=50, kde=True, ax=ax[1], color="#61a5c2")
    ax[1].set_title("Log price distribution"); ax[1].set_xlabel("log(1 + price)")
    plt.tight_layout(); plt.savefig("outputs/fig_price_distribution.png", dpi=150); plt.close()

    plt.figure(figsize=(9, 4.5))
    order = df.groupby("city")[TARGET].median().sort_values(ascending=False).index
    sns.boxplot(data=df, x="city", y=df[TARGET] / 1e7, order=order, color="#89c2d9")
    plt.ylabel("Price (crore)"); plt.title("Price by city"); plt.xticks(rotation=30)
    plt.tight_layout(); plt.savefig("outputs/fig_price_by_city.png", dpi=150); plt.close()

    plt.figure(figsize=(7, 5))
    sns.scatterplot(data=df.sample(1500, random_state=1), x="area_sqft", y=df[TARGET] / 1e7,
                    hue="bhk", palette="viridis", alpha=0.7)
    plt.ylabel("Price (crore)"); plt.title("Area vs price (coloured by BHK)")
    plt.tight_layout(); plt.savefig("outputs/fig_area_vs_price.png", dpi=150); plt.close()

    plt.figure(figsize=(9, 7))
    sns.heatmap(df[NUM + [TARGET]].corr(), cmap="coolwarm", center=0, annot=False)
    plt.title("Correlation heatmap"); plt.tight_layout()
    plt.savefig("outputs/fig_correlation.png", dpi=150); plt.close()


def build_pipeline(model, scale=False):
    num_t = StandardScaler() if scale else "passthrough"
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CAT),
        ("num", num_t, NUM),
    ])
    return Pipeline([("pre", pre), ("model", model)])


def mape(y, p):
    return float(np.mean(np.abs((y - p) / y)) * 100)


def main():
    df = pd.read_csv("data/properties.csv")
    print("Dataset:", df.shape, "| missing values:", int(df.isna().sum().sum()))
    eda(df)

    X, y = df[CAT + NUM], df[TARGET]
    # Train on log-price (price is right-skewed), evaluate in rupees
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
    y_tr_log = np.log1p(y_tr)

    models = {
        "Linear Regression": build_pipeline(LinearRegression(), scale=True),
        "Ridge Regression": build_pipeline(Ridge(alpha=1.0), scale=True),
        "Random Forest": build_pipeline(RandomForestRegressor(n_estimators=250, n_jobs=-1, random_state=42)),
        "Gradient Boosting": build_pipeline(GradientBoostingRegressor(n_estimators=300, max_depth=4,
                                                                      learning_rate=0.08, random_state=42)),
        "XGBoost": build_pipeline(XGBRegressor(n_estimators=500, max_depth=6, learning_rate=0.05,
                                               subsample=0.9, colsample_bytree=0.9,
                                               random_state=42, n_jobs=-1)),
    }

    results, preds = [], {}
    kf = KFold(5, shuffle=True, random_state=42)
    for name, pipe in models.items():
        pipe.fit(X_tr, y_tr_log)
        p = np.expm1(pipe.predict(X_te))
        preds[name] = p
        cv = cross_val_score(pipe, X_tr, y_tr_log, cv=kf, scoring="r2", n_jobs=1)
        results.append({
            "Model": name,
            "MAE (INR lakh)": mean_absolute_error(y_te, p) / 1e5,
            "RMSE (INR lakh)": np.sqrt(mean_squared_error(y_te, p)) / 1e5,
            "R2": r2_score(y_te, p),
            "MAPE (%)": mape(y_te.values, p),
            "CV R2 (log, 5-fold)": cv.mean(),
        })
        print(f"{name:20s} R2={results[-1]['R2']:.4f}  MAPE={results[-1]['MAPE (%)']:.2f}%")

    res = pd.DataFrame(results).sort_values("R2", ascending=False).round(4)
    res.to_csv("outputs/model_comparison.csv", index=False)
    best_name = res.iloc[0]["Model"]
    best = models[best_name]
    print("\nBest model:", best_name)

    # ---- charts ----
    plt.figure(figsize=(8, 4))
    sns.barplot(data=res, x="R2", y="Model", color="#2a6f97")
    plt.xlim(res["R2"].min() - 0.05, 1.0); plt.title("Model comparison (R2 on test set)")
    plt.tight_layout(); plt.savefig("outputs/fig_model_comparison.png", dpi=150); plt.close()

    bp = preds[best_name]
    fig, ax = plt.subplots(1, 2, figsize=(12, 5))
    ax[0].scatter(y_te / 1e7, bp / 1e7, s=8, alpha=0.5, color="#2a6f97")
    lim = [0, max(y_te.max(), bp.max()) / 1e7]
    ax[0].plot(lim, lim, "r--"); ax[0].set_xlabel("Actual (crore)"); ax[0].set_ylabel("Predicted (crore)")
    ax[0].set_title(f"{best_name}: actual vs predicted")
    resid = (y_te.values - bp) / 1e5
    sns.histplot(resid, bins=50, kde=True, ax=ax[1], color="#61a5c2")
    ax[1].set_title("Residuals (INR lakh)"); ax[1].set_xlabel("Actual - Predicted")
    plt.tight_layout(); plt.savefig("outputs/fig_actual_vs_predicted.png", dpi=150); plt.close()

    # Feature importance (tree models) via aggregated one-hot groups
    model_obj = best.named_steps["model"]
    if hasattr(model_obj, "feature_importances_"):
        names = best.named_steps["pre"].get_feature_names_out()
        imp = pd.Series(model_obj.feature_importances_, index=names)
        grouped = {}
        for n, v in imp.items():
            base = n.split("__", 1)[1]
            for c in CAT:
                if base.startswith(c + "_"):
                    base = c
                    break
            grouped[base] = grouped.get(base, 0) + v
        gi = pd.Series(grouped).sort_values(ascending=True).tail(12)
        plt.figure(figsize=(7, 5)); gi.plot.barh(color="#2a6f97")
        plt.title(f"Top feature importances ({best_name})"); plt.tight_layout()
        plt.savefig("outputs/fig_feature_importance.png", dpi=150); plt.close()
        gi.sort_values(ascending=False).to_csv("outputs/feature_importance.csv", header=["importance"])

    # Refit best on all data, save
    best.fit(X, np.log1p(y))
    joblib.dump(best, "models/price_model.joblib")
    meta = {
        "best_model": best_name,
        "metrics": res.iloc[0].to_dict(),
        "rows": int(len(df)),
        "train_rows": int(len(X_tr)),
        "test_rows": int(len(X_te)),
        "cat_features": CAT, "num_features": NUM,
        "resid_std_log": float(np.std(np.log1p(y_te.values) - np.log1p(bp))),
    }
    json.dump(meta, open("models/model_meta.json", "w"), indent=2, default=float)
    print(res.to_string(index=False))


if __name__ == "__main__":
    main()
