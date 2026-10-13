"""
app.py - Streamlit web interface
Run:  streamlit run app.py
"""
import pandas as pd
import streamlit as st
import predictor
from generate_data import CITIES, PROPERTY_TYPES, FURNISHING, AMENITY_COLS

st.set_page_config(page_title="Real Estate Price Prediction & Recommendation", page_icon="🏠", layout="wide")
st.title("🏠 Real Estate Price Prediction & Recommendation System")


def inr(v):
    v = float(v)
    return f"₹{v/1e7:.2f} Cr" if v >= 1e7 else f"₹{v/1e5:.1f} Lakh"


tab1, tab2, tab3 = st.tabs(["💰 Price Prediction", "⭐ Recommendations", "📊 Market Insights"])

# ---------------- Tab 1: prediction ----------------
with tab1:
    st.subheader("Estimate a property's fair price")
    c1, c2, c3 = st.columns(3)
    with c1:
        city = st.selectbox("City", list(CITIES.keys()), key="p_city")
        locality = st.selectbox("Locality", list(CITIES[city][1].keys()), key="p_loc")
        ptype = st.selectbox("Property type", PROPERTY_TYPES, key="p_type")
        furnishing = st.selectbox("Furnishing", FURNISHING, key="p_furn")
    with c2:
        bhk = st.slider("BHK", 1, 5, 2, key="p_bhk")
        area = st.number_input("Area (sq ft)", 300, 6000, 1000, step=50, key="p_area")
        bathrooms = st.slider("Bathrooms", 1, 6, 2, key="p_bath")
        age = st.slider("Age of property (years)", 0, 30, 5, key="p_age")
    with c3:
        floor = st.slider("Floor", 0, 24, 3, key="p_floor")
        total_floors = st.slider("Total floors", 1, 30, 10, key="p_tf")
        metro = st.slider("Distance to metro (km)", 0.1, 20.0, 2.0, key="p_metro")
        amen_sel = st.multiselect("Amenities", AMENITY_COLS, default=["parking", "security", "lift"], key="p_amen")

    if st.button("Predict price", type="primary"):
        feats = {"city": city, "locality": locality, "property_type": ptype, "furnishing": furnishing,
                 "bhk": bhk, "area_sqft": area, "bathrooms": bathrooms, "age_years": age,
                 "floor": floor, "total_floors": max(total_floors, floor), "metro_distance_km": metro,
                 **{a: int(a in amen_sel) for a in AMENITY_COLS}}
        r = predictor.predict_price(feats)
        m1, m2, m3 = st.columns(3)
        m1.metric("Predicted price", inr(r["predicted_price"]))
        m2.metric("Likely range (90%)", f"{inr(r['lower_bound'])} – {inr(r['upper_bound'])}")
        m3.metric("Price per sq ft", f"₹{r['price_per_sqft']:,}")

# ---------------- Tab 2: recommendation ----------------
with tab2:
    st.subheader("Find properties that match your needs")
    c1, c2, c3 = st.columns(3)
    with c1:
        r_city = st.selectbox("City", list(CITIES.keys()), key="r_city")
        r_loc = st.selectbox("Preferred locality (optional)", ["Any"] + list(CITIES[r_city][1].keys()), key="r_loc")
        r_type = st.selectbox("Property type", ["Any"] + PROPERTY_TYPES, key="r_type")
    with c2:
        r_bhk = st.slider("Minimum BHK", 1, 5, 2, key="r_bhk")
        r_area = st.number_input("Minimum area (sq ft)", 300, 6000, 800, step=50, key="r_area")
        budget = st.slider("Budget (₹ lakh)", 10, 2000, (50, 150), key="r_budget")
    with c3:
        r_amen = st.multiselect("Must-have amenities", AMENITY_COLS, default=["parking"], key="r_amen")
        top_n = st.slider("Number of results", 3, 15, 5, key="r_n")

    if st.button("Recommend", type="primary"):
        prefs = {"city": r_city, "bhk": r_bhk, "min_area": r_area, "min_budget": budget[0] * 1e5,
                 "max_budget": budget[1] * 1e5, "amenities": r_amen}
        if r_loc != "Any":
            prefs["locality"] = r_loc
        if r_type != "Any":
            prefs["property_type"] = r_type
        res = predictor.recommend(prefs, top_n=top_n)
        if res.empty:
            st.warning("No listings match these filters. Try widening your budget or lowering the BHK.")
        else:
            show = res.copy()
            show["Listed"] = show["price_inr"].map(inr)
            show["Fair value (model)"] = show["fair_price"].map(inr)
            show["Deal"] = show["value_gap_pct"].map(
                lambda g: f"{g:+.1f}% {'below' if g > 0 else 'above'} fair value")
            st.dataframe(show[["property_id", "locality", "property_type", "bhk", "area_sqft", "age_years",
                               "furnishing", "metro_distance_km", "Listed", "Fair value (model)", "Deal",
                               "match_score"]], use_container_width=True, hide_index=True)

# ---------------- Tab 3: market ----------------
with tab3:
    st.subheader("City-wise market summary")
    ms = predictor.market_summary()
    st.dataframe(ms, use_container_width=True, hide_index=True)
    st.bar_chart(ms.set_index("city")["avg_price_per_sqft"])
    all_df = predictor.get_listings()
    st.caption(f"Database contains {len(all_df):,} listings.")
