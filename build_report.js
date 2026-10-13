// build_report.js - generates Project_Report.docx following the college report format
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  HeadingLevel, PageBreak, Footer, PageNumber, NumberFormat, BorderStyle, ShadingType, Tab, TabStopType,
  LeaderType, LineRuleType,
} = require("docx");

const DATA = JSON.parse(fs.readFileSync("outputs/report_data.json"));
const PAGEMAP = fs.existsSync("outputs/pagemap.json") ? JSON.parse(fs.readFileSync("outputs/pagemap.json")) : {};
const MODELS = fs.readFileSync("outputs/model_comparison.csv", "utf8").trim().split("\n").slice(1).map((l) => {
  const m = l.match(/^([^,]+),([^,]+),([^,]+),([^,]+),([^,]+),"?([^"]+)"?$/);
  return { name: m[1], mae: m[2], rmse: m[3], r2: m[4], mape: m[5], cv: m[6] };
});
const FEAT = fs.readFileSync("outputs/feature_importance.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));

const FONT = "Times New Roman";
const CW = 8666; // content width in DXA (A4, left 1.25in, right 1in)
const keys = []; // for page lookup: {key, kind}

// ---------- helpers ----------
const run = (t, o = {}) => new TextRun({ text: t, font: FONT, size: o.size || 24, bold: o.bold, italics: o.italics, ...o.extra });
const P = (t, o = {}) =>
  new Paragraph({
    alignment: o.align || AlignmentType.JUSTIFIED,
    spacing: { line: o.line || 360, lineRule: LineRuleType.AUTO, before: o.before || 0, after: o.after === undefined ? 120 : o.after },
    keepNext: o.keepNext,
    indent: o.indent,
    children: Array.isArray(t) ? t : [run(t, o)],
  });
const blank = (n = 1) => Array.from({ length: n }, () => P("", { after: 0 }));
const pb = () => new Paragraph({ children: [new PageBreak()] });
const bullet = (t) =>
  new Paragraph({ numbering: { reference: "bul", level: 0 }, alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 60 }, children: [run(t)] });
const mkNum = (ref) => (t) =>
  new Paragraph({ numbering: { reference: ref, level: 0 }, alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 360, after: 60 }, children: [run(t)] });

const numbered1 = mkNum('num1'), numbered2 = mkNum('num2'), numbered3 = mkNum('num3');
const toc = []; // {level, text}
function H1(text, tocKind = "arabic") {
  toc.push({ level: 1, text }); keys.push({ key: text, kind: tocKind });
  return new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true,
    spacing: { before: 0, after: 240 }, children: [run(text, { bold: true, size: 32 })] });
}
function H2(text) {
  toc.push({ level: 2, text }); keys.push({ key: text, kind: "arabic" });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 200, after: 120 },
    children: [run(text, { bold: true, size: 28 })] });
}
function H3(text) {
  toc.push({ level: 3, text }); keys.push({ key: text, kind: "arabic" });
  return new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, spacing: { before: 160, after: 100 },
    children: [run(text, { bold: true, size: 24 })] });
}
// prelim heading (unnumbered, centred, roman page)
function PH(text, inToc = true) {
  if (inToc) { toc.push({ level: 1, text, prelim: true }); keys.push({ key: text, kind: "roman" }); }
  return new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, pageBreakBefore: true,
    spacing: { after: 240 }, children: [run(text, { bold: true, size: 32 })] });
}

const figs = [], tabs = [];
function pngSize(path) {
  const b = fs.readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
function FIG(path, caption, widthPx = 520) {
  const { w, h } = pngSize(path);
  figs.push(caption); keys.push({ key: caption.split(":")[0] + ":", kind: "fig", caption });
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 60 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(path), transformation: { width: widthPx, height: Math.round((widthPx * h) / w) },
        altText: { title: caption, description: caption, name: caption } })] }),
    P(caption, { align: AlignmentType.CENTER, italics: true, size: 22, after: 200, line: 276 }),
  ];
}

const bd = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
const borders = { top: bd, bottom: bd, left: bd, right: bd };
function TBL(caption, header, rows, widths) {
  tabs.push(caption); keys.push({ key: caption.split(":")[0] + ":", kind: "tab", caption });
  const sum = widths.reduce((a, b) => a + b, 0);
  const cell = (t, w, hdr, keep = true) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders,
    shading: hdr ? { type: ShadingType.CLEAR, fill: "D9E2F3", color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [new Paragraph({ keepNext: keep, spacing: { line: 276 }, alignment: AlignmentType.LEFT, children: [run(String(t), { bold: hdr, size: 21 })] })],
  });
  return [
    P(caption, { align: AlignmentType.CENTER, bold: true, size: 22, after: 80, before: 160, keepNext: true, line: 276 }),
    new Table({ width: { size: sum, type: WidthType.DXA }, columnWidths: widths, alignment: AlignmentType.CENTER,
      rows: [new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, widths[i], true)) }),
        ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], false, ri < rows.length - 1)) }))] }),
    P("", { after: 160, line: 240 }),
  ];
}

const inr = (v) => (v >= 1e7 ? `Rs ${(v / 1e7).toFixed(2)} crore` : `Rs ${(v / 1e5).toFixed(1)} lakh`);
const best = MODELS[0];

// ======================= CONTENT =======================
const title = "REAL ESTATE PRICE PREDICTION AND RECOMMENDATION SYSTEM";

// ---- title page ----
const titlePage = [
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 360 },
    children: [run("[ COLLEGE LOGO ]", { bold: true, size: 22 })] }),
  ...blank(2),
  P("A PROJECT REPORT", { align: AlignmentType.CENTER, bold: true, size: 28, after: 360 }),
  P(title, { align: AlignmentType.CENTER, bold: true, size: 36, after: 480, line: 400 }),
  P("Submitted in partial fulfilment of the requirements for the award of the degree of", { align: AlignmentType.CENTER, italics: true, after: 120 }),
  P("[ DEGREE / PROGRAMME NAME ]", { align: AlignmentType.CENTER, bold: true, after: 480 }),
  P("Submitted to", { align: AlignmentType.CENTER, after: 60 }),
  P("[ NAME OF ORGANIZATION / COLLEGE / UNIVERSITY ]", { align: AlignmentType.CENTER, bold: true, after: 480 }),
  P("Submitted by", { align: AlignmentType.CENTER, after: 60 }),
  P("Name: Satish Kumar", { align: AlignmentType.CENTER, bold: true, after: 20 }),
  P("Registration No.: 2323626", { align: AlignmentType.CENTER, bold: true, after: 20 }),
  P("Designation: Student, [ Course / Semester ]", { align: AlignmentType.CENTER, bold: true, after: 240 }),
  P("Project Guide: [ Guide Name, Designation ]", { align: AlignmentType.CENTER, after: 20 }),
  P("Academic Year: 2026-27", { align: AlignmentType.CENTER }),
];

// ---- declaration ----
const declaration = [
  PH("DECLARATION", false),
  P("I hereby declare that the project report entitled \"Real Estate Price Prediction and Recommendation System\" submitted to [ Name of Organization / College ] is a record of original work done by me under the guidance of [ Guide Name ], [ Designation ]. The work presented here is my own, it has been completed without any conflict of interest, and it has not been submitted to any other university or institute for the award of any degree, diploma or similar title. All sources of information used in this report have been duly acknowledged in the references.", { before: 120 }),
  ...blank(3),
  P("Place: ______________", { align: AlignmentType.LEFT, after: 20 }),
  P("Date: ______________", { align: AlignmentType.LEFT, after: 480 }),
  P("Signature of the Student: ______________________", { align: AlignmentType.RIGHT, after: 20 }),
  P("(Satish Kumar, Reg. No. 2323626)", { align: AlignmentType.RIGHT, after: 600 }),
  P("Approved by the Project Guide", { align: AlignmentType.LEFT, bold: true, after: 480 }),
  P("Signature: ______________________", { align: AlignmentType.LEFT, after: 20 }),
  P("Name and Designation: ______________________", { align: AlignmentType.LEFT, after: 20 }),
];

// ---- abstract (<=350 words, TNR 14, double spacing) ----
const abstractText = [
  "Property prices vary widely with location, size, age, amenities and market conditions, which makes it difficult for buyers to judge whether a listing is fairly priced. Manual comparison of listings is slow and inconsistent. This project develops a data-driven system that estimates the fair price of a property and recommends properties that match a user's preferences.",
  `The objective is to build and evaluate machine-learning models for price prediction and to combine the best model with a rule-and-score based recommendation engine, exposed through a REST API and a web interface. A dataset of ${DATA.n_rows.toLocaleString()} listings across eight Indian cities, with ${DATA.n_cols} attributes, was stored in an SQL database. Five regression models (Linear, Ridge, Random Forest, Gradient Boosting and XGBoost) were trained on log-transformed price using Python, Pandas, NumPy and Scikit-learn, and compared using MAE, RMSE, R-squared, MAPE and five-fold cross-validation. The recommender filters listings by SQL queries and ranks them with a 100-point score covering budget fit, value-for-money against the model's fair price, area, locality, amenities, metro distance and age. The system is served by a Flask API and a Streamlit application and can be deployed on AWS.`,
  `XGBoost gave the best test performance with R-squared of ${best.r2} and MAPE of ${best.mape} percent. Because the dataset used here is synthetic, these figures show that the pipeline works end to end and should be re-measured on real market data before any practical use. The project scope covers price estimation, preference-based recommendation and market summaries, with future scope for live data, image features and explainable predictions.`,
];
const abstractWords = abstractText.join(" ").split(/\s+/).length;
if (abstractWords > 350) throw new Error("Abstract too long: " + abstractWords);
const abstract = [
  PH("ABSTRACT"),
  ...abstractText.map((t) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 480, after: 0 }, children: [run(t, { size: 28 })] })),
];

const ack = [
  PH("ACKNOWLEDGEMENT"),
  P("I express my sincere gratitude to my project guide, [ Guide Name ], for the guidance, encouragement and constructive feedback given throughout this project. I thank the Head of the Department and the faculty members of [ Department ] for providing the facilities and academic support needed to complete this work.", { before: 120 }),
  P("I also thank the open-source communities behind Python, Pandas, NumPy, Scikit-learn, XGBoost, Matplotlib, Seaborn, SQLite, Flask and Streamlit, whose free tools made this project possible. Finally, I thank my family and friends for their continuous support and motivation."),
  ...blank(2),
  P("Satish Kumar (2323626)", { align: AlignmentType.RIGHT, bold: true }),
];

// ---- symbols table ----
const symRows = [
  ["y", "Actual property price (INR)"], ["ŷ", "Predicted property price (INR)"], ["n", "Number of test samples"],
  ["R²", "Coefficient of determination"], ["MAE", "Mean Absolute Error"], ["RMSE", "Root Mean Squared Error"],
  ["MAPE", "Mean Absolute Percentage Error"], ["CV", "Cross-validation"], ["ML", "Machine Learning"],
  ["EDA", "Exploratory Data Analysis"], ["XGBoost", "Extreme Gradient Boosting"], ["SQL", "Structured Query Language"],
  ["API", "Application Programming Interface"], ["REST", "Representational State Transfer"], ["UI", "User Interface"],
  ["BHK", "Bedroom, Hall, Kitchen (number of bedrooms)"], ["INR", "Indian Rupee"], ["Lakh", "100,000 INR"],
  ["Crore", "10,000,000 INR"], ["sq ft", "Square feet"], ["AWS / EC2", "Amazon Web Services / Elastic Compute Cloud"],
  ["CSV", "Comma Separated Values"], ["JSON", "JavaScript Object Notation"],
];
function symbolsPage() {
  const widths = [2200, 6466];
  const cell = (t, w, hdr) => new TableCell({ width: { size: w, type: WidthType.DXA }, borders,
    shading: hdr ? { type: ShadingType.CLEAR, fill: "D9E2F3", color: "auto" } : undefined,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children: [new Paragraph({ spacing: { line: 360 }, children: [run(t, { bold: hdr })] })] });
  return [PH("LIST OF SYMBOLS, ABBREVIATIONS AND NOMENCLATURE", false),
    new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths,
      rows: [new TableRow({ tableHeader: true, children: [cell("Symbol / Abbreviation", widths[0], true), cell("Meaning", widths[1], true)] }),
        ...symRows.map((r) => new TableRow({ cantSplit: true, children: [cell(r[0], widths[0]), cell(r[1], widths[1])] }))] })];
}

// ---- chapters ----
const ch1 = [
  H1("CHAPTER 1: INTRODUCTION"),
  H2("1.1 Background"),
  P("Buying a house is among the largest financial decisions most people make. Prices of otherwise similar homes differ by large amounts depending on the city, the locality, the size of the unit, its age, the amenities offered and its distance from public transport. Portals list thousands of properties, but buyers still have to judge on their own whether an asking price is reasonable and which listings deserve a visit."),
  P("Machine learning can learn the relationship between property attributes and price from past listings, and a recommendation engine can use that knowledge to rank listings for a particular buyer. This project combines both ideas in a single system."),
  H2("1.2 Problem Statement"),
  P("Property prices vary by location, area, amenities and market conditions, making it difficult for buyers to estimate fair prices. Manual comparison is time-consuming and inconsistent. The project builds a data-driven system that estimates property prices and recommends relevant properties according to user requirements."),
  H2("1.3 Aim and Objectives"),
  P("The aim of the project is to design, implement and evaluate a system that predicts property prices and recommends suitable properties using open-source technologies. The specific objectives are:"),
  numbered1("To collect and store property listing data in an SQL database and prepare it for modelling."),
  numbered1("To train and compare several regression models and select the best one using suitable metrics."),
  numbered1("To build a recommendation feature that filters and ranks properties by user preferences such as budget, location, area and amenities."),
  numbered1("To provide a simple web interface and a REST API for entering property details and viewing predicted prices and recommendations."),
  numbered1("To present model evaluation through clear result visualizations."),
  H2("1.4 Scope of the Project"),
  P("The project covers data storage and querying with SQL, exploratory analysis, price prediction for apartments, independent houses, villas and builder floors in eight Indian cities, preference-based recommendation, a Flask REST API, a Streamlit web interface and a deployment route on AWS. The system estimates prices from the attributes it is given; it does not capture negotiation, legal status of a property or sudden market shocks."),
  H2("1.5 Future Scope"),
  P("The system can be extended with live listing data collected through partner APIs, photographs and neighbourhood features such as schools and hospitals, explainable predictions using SHAP values, price-trend forecasting over time, user accounts with saved searches, and a learning-based recommender that uses click and enquiry history."),
  H2("1.6 Organization of the Report"),
  P("Chapter 2 explains the approach selected and how it was applied. Chapter 3 presents the experiments, results and discussion. Chapter 4 gives the conclusion and recommendations. The appendices give the execution steps, SQL, API usage, deployment steps and source code."),
];

const ch2 = [
  H1("CHAPTER 2: APPROACH USED"),
  H2("2.1 Selection of Approach"),
  P("Three ways of solving the problem were considered: (a) a rule-based estimator that multiplies area by an average rate per locality, (b) classical statistical regression, and (c) machine-learning regression with tree-based ensembles. Cost was a key criterion, so only open-source tools that run on a single low-cost server were considered."),
  ...TBL("Table 2.1: Comparison of candidate approaches",
    ["Approach", "Accuracy", "Cost", "Remarks"],
    [["Rule-based average rate", "Low", "Very low", "Ignores age, amenities, floor and other factors"],
     ["Linear / Ridge regression", "Good", "Very low", "Fast and interpretable; cannot capture interactions"],
     ["Random Forest / Gradient Boosting / XGBoost", "Best on real tabular data", "Low", "Captures non-linear effects; needs tuning"]],
    [2700, 1500, 1200, 3266]),
  P("The selected approach is to train several models, from simple linear regression to XGBoost, on the same data and keep the best performer according to hold-out and cross-validated metrics. This is financially viable because Python, Scikit-learn, XGBoost, SQLite, Flask and Streamlit are free, and the final application runs on a small AWS EC2 instance. Trying both simple and complex models also guards against paying for complexity that does not help. For recommendation, a transparent weighted scoring method was chosen over collaborative filtering because no user-interaction history is available."),
  H2("2.2 Application of Selected Approach"),
  ...FIG("outputs/fig_architecture.png", "Figure 2.1: System architecture of the proposed system", 540),
  H3("2.2.1 Dataset"),
  P(`A dataset of ${DATA.n_rows.toLocaleString()} property listings with ${DATA.n_cols} columns was used. Listings cover Mumbai, Delhi, Bangalore, Hyderabad, Chennai, Pune, Chandigarh and Kolkata with five localities each. The data was generated by the script generate_data.py using city- and locality-level price rates, depreciation with age, floor and amenity premiums and random market noise, so that it behaves like a real listing table. It is synthetic; no real transaction data was collected. The same code trains on a real dataset if its CSV uses the same columns (Appendix 1).`),
  ...TBL("Table 2.2: Attributes in the dataset",
    ["Attribute", "Type", "Description"],
    [["city, locality", "Categorical", "Location of the property"],
     ["property_type", "Categorical", "Apartment, Independent House, Villa, Builder Floor"],
     ["furnishing", "Categorical", "Unfurnished, Semi-Furnished, Furnished"],
     ["bhk, bathrooms", "Numeric", "Number of bedrooms and bathrooms"],
     ["area_sqft", "Numeric", "Built-up area in square feet"],
     ["age_years, floor, total_floors", "Numeric", "Age of building and floor details"],
     ["metro_distance_km", "Numeric", "Distance to the nearest metro station"],
     ["gym, swimming_pool, parking, security, lift, garden, clubhouse, power_backup", "Binary", "Amenity available (1) or not (0)"],
     ["price_inr", "Numeric (target)", "Listing price in INR"]],
    [3300, 1500, 3866]),
  H3("2.2.2 SQL Database"),
  P("Listings are loaded into an SQLite database (real_estate.db) with indexes on city and price. All filtering for the recommender uses parameterised SQL queries, and the city-wise market summary is produced with a GROUP BY query (Appendix 2). SQLite was chosen because it needs no server; the same SQL runs on MySQL or PostgreSQL if the project is scaled up."),
  H3("2.2.3 Data Preprocessing"),
  P("The dataset has no missing values. Categorical features (city, locality, property type, furnishing) are one-hot encoded, with unseen categories ignored at prediction time. Numeric features are standardized for the linear models and passed unchanged to tree models. Because price is strongly right-skewed (Figure 3.1), models are trained on log(1 + price) and predictions are converted back to rupees. The data is split 80:20 into training and test sets with a fixed random seed (4,000 and 1,000 rows)."),
  H3("2.2.4 Machine-Learning Models"),
  bullet("Linear Regression and Ridge Regression: baseline models that assume a linear relationship between features and log-price."),
  bullet("Random Forest: 250 decision trees averaged to reduce variance."),
  bullet("Gradient Boosting: 300 sequential trees of depth 4 with a learning rate of 0.08."),
  bullet("XGBoost: 500 trees of depth 6, learning rate 0.05 and 90 percent row and column sampling."),
  P("Each model is wrapped with its preprocessing in a Scikit-learn Pipeline so that the same transformations apply at training and prediction time. Models are scored with MAE, RMSE, R-squared and MAPE on the test set, and with five-fold cross-validated R-squared on the training set. The best model is refitted on all data and saved with joblib."),
  H3("2.2.5 Recommendation Engine"),
  P("The recommender works in two steps. First, hard constraints from the user (city, property type, minimum BHK and budget range) are applied through SQL. Second, each remaining listing is scored out of 100 and the top N are returned. The score components are: budget fit (25), value-for-money (20), area (15), amenities (15), locality match (10), metro proximity (10) and building age (5). Value-for-money compares the listed price with the model's predicted fair price, so that listings priced below their estimated fair value rank higher. The output also shows how far each listing is above or below its fair value."),
  H3("2.2.6 REST API"),
  P("A Flask application exposes the model and the recommender so that other applications can use them."),
  ...TBL("Table 2.3: REST API endpoints",
    ["Method", "Endpoint", "Purpose"],
    [["GET", "/health", "Service status check"],
     ["POST", "/predict", "Returns predicted price, 90% range and price per sq ft"],
     ["POST", "/recommend", "Returns the top-N listings that match given preferences"],
     ["GET", "/market", "Returns city-wise listing count and average prices"]],
    [1300, 2200, 5166]),
  P("The 90 percent price range is derived from the standard deviation of the model's log-price errors on the test set, assuming those errors are roughly normal."),
  H3("2.2.7 Web Interface"),
  P("The Streamlit application has three tabs: Price Prediction (a form for the property details that shows the predicted price, likely range and price per sq ft), Recommendations (preferences in, ranked listings out) and Market Insights (city-wise table and chart)."),
  H3("2.2.8 Deployment on AWS"),
  P("The application is deployed on an AWS EC2 instance (a free-tier or small instance is enough) running the Streamlit app and the Flask API, with the security group opening only the required ports. Step-by-step instructions are given in Appendix 4."),
];

// results
const sample = DATA.sample_in, so = DATA.sample_out;
const recRows = DATA.rec.map((r, i) => [i + 1, `${r.locality}, ${r.property_type}`, r.bhk, r.area_sqft, inr(r.price_inr), inr(r.fair_price), `${r.value_gap_pct > 0 ? "+" : ""}${r.value_gap_pct}%`, r.match_score]);
const topFeat = FEAT.slice(0, 6).map((f) => [f[0], (parseFloat(f[1]) * 100).toFixed(1) + "%"]);
const ch3 = [
  H1("CHAPTER 3: RESULTS AND DISCUSSION"),
  H2("3.1 Exploratory Data Analysis"),
  P(`The dataset contains ${DATA.n_rows.toLocaleString()} listings. Prices range from ${inr(DATA.price_min)} to ${inr(DATA.price_max)}, with a median of ${inr(DATA.price_median)} and a mean of ${inr(DATA.price_mean)}. The mean being above the median shows right skew, which is why log-price was used for training.`),
  ...FIG("outputs/fig_price_distribution.png", "Figure 3.1: Distribution of property prices and log prices", 520),
  P("Prices differ strongly by city. Mumbai is the most expensive and Kolkata the least, as shown in Figure 3.2 and Table 3.1."),
  ...FIG("outputs/fig_price_by_city.png", "Figure 3.2: Price distribution by city", 480),
  ...TBL("Table 3.1: City-wise market summary (from SQL query)",
    ["City", "Listings", "Avg price (lakh)", "Avg price per sq ft (INR)"],
    DATA.market.map((m) => [m.city, m.listings, m.avg_price_lakh, m.avg_price_per_sqft.toLocaleString()]),
    [2400, 1700, 2200, 2366]),
  ...FIG("outputs/fig_area_vs_price.png", "Figure 3.3: Relationship between area and price, coloured by BHK", 440),
  P("Price rises with area and with BHK, but the spread at any given area shows the effect of location. The correlation heatmap in Figure 3.4 confirms that area, BHK and bathrooms are strongly related to price and to each other."),
  ...FIG("outputs/fig_correlation.png", "Figure 3.4: Correlation heatmap of numeric features", 440),
  H2("3.2 Model Performance"),
  P("Table 3.2 gives the performance of the five models on the 1,000 test listings. MAE and RMSE are in lakh rupees."),
  ...TBL("Table 3.2: Model comparison on the test set",
    ["Model", "MAE (lakh)", "RMSE (lakh)", "R²", "MAPE (%)", "CV R² (5-fold)"],
    MODELS.map((m) => [m.name, m.mae, m.rmse, m.r2, m.mape, m.cv]),
    [2300, 1150, 1250, 1100, 1250, 1616]),
  ...FIG("outputs/fig_model_comparison.png", "Figure 3.5: Test R² of the compared models", 420),
  P(`XGBoost is the best model with R² of ${best.r2}, RMSE of ${best.rmse} lakh and MAPE of ${best.mape} percent, so it is the model used in the application. Linear and Ridge regression are very close (R² of ${MODELS[1].r2} and ${MODELS[2].r2}), and the cross-validated R² of Linear Regression is marginally higher than that of XGBoost. Random Forest is the weakest.`),
  ...FIG("outputs/fig_actual_vs_predicted.png", "Figure 3.6: XGBoost actual versus predicted prices and residual distribution", 540),
  P("Figure 3.6 shows predictions lying close to the ideal line, with a residual distribution centred near zero. The largest errors occur for the most expensive properties (above about 4 crore), where there are few training examples."),
  H2("3.3 Feature Importance"),
  ...FIG("outputs/fig_feature_importance.png", "Figure 3.7: Top feature importances of the XGBoost model", 400),
  P(`Location dominates: city (${topFeat[0][1]}) and locality (${topFeat[1][1]}) together account for almost all of the model's importance, followed by area (${topFeat[2][1]}) and BHK (${topFeat[3][1]}). This matches the data, where the rate per square foot differs by a factor of three or more between cities and localities, while amenities and age change it by a few percent. Importance is shared among correlated features such as area, BHK and bathrooms, so the small values for individual features should not be read as meaning they are unimportant for price in absolute terms.`),
  H2("3.4 Price Prediction Example"),
  P(`A sample input was a ${sample.bhk} BHK ${sample.property_type.toLowerCase()} in ${sample.locality}, ${sample.city}, of ${sample.area_sqft} sq ft, ${sample.age_years} years old, on floor ${sample.floor}, ${sample.metro_distance_km} km from a metro station, with parking, security, lift and gym. The system predicted ${inr(so.predicted_price)} (${so.price_per_sqft.toLocaleString()} INR per sq ft), with a 90 percent range of ${inr(so.lower_bound)} to ${inr(so.upper_bound)}.`),
  H2("3.5 Recommendation Results"),
  P("A buyer looking in Pune for a property of at least 2 BHK and 800 sq ft with a budget of Rs 40 to 90 lakh, preferring Baner and needing parking and security, received the ranking in Table 3.3. A positive value gap means the listing is priced below the model's fair value."),
  ...TBL("Table 3.3: Top five recommendations for the sample user",
    ["#", "Locality, type", "BHK", "Area (sq ft)", "Listed", "Fair value", "Gap", "Score"],
    recRows, [380, 2000, 560, 900, 1250, 1250, 1000, 1326]),
  P("The top two listings are in the preferred locality, Baner, and sit inside the budget at or just below their fair value. Other localities appear next because they fit the budget and amenities well and are priced under fair value. This shows the balance the score strikes between stated preference and value."),
  H2("3.6 API and Web Application Testing"),
  P("The Flask API and Streamlit application were run and tested. The /health endpoint returned status ok, the /predict endpoint returned a price estimate for a valid request, a request with missing fields returned HTTP 400 with the list of missing fields, and /recommend returned ranked listings as JSON. The Streamlit server started and served the application page successfully. Browser-based interaction testing and load testing were not carried out."),
  H2("3.7 Discussion and Limitations"),
  bullet("The dataset is synthetic and its prices follow a mostly multiplicative structure. That explains why a log-linear model matches XGBoost so closely and why R² is high. On real listings, noise, missing values and irregular effects are larger, so lower scores and a clearer advantage for boosted trees should be expected. The reported figures should be taken as a check that the pipeline works, not as accuracy that real buyers would see."),
  bullet("Listed prices in real data are asking prices, not transaction prices, which adds a systematic bias."),
  bullet("The 90 percent range assumes constant log-error variance across all properties, which is likely not true for luxury properties."),
  bullet("The recommender weights are chosen by judgement and have not been tuned against real user feedback."),
  bullet("The model is trained on one snapshot of data and does not account for price changes over time."),
];

const ch4 = [
  H1("CHAPTER 4: CONCLUSION AND RECOMMENDATIONS"),
  H2("4.1 Conclusion"),
  P(`This project built a complete system for real-estate price prediction and recommendation: an SQL-backed listings database, a model-training pipeline comparing five regression algorithms, a score-based recommendation engine, a REST API and a web interface. XGBoost gave the best test results (R² ${best.r2}, MAPE ${best.mape} percent), and location (city and locality) was found to be by far the most influential factor. The recommender combines user constraints with the model's fair-price estimate to surface listings that match a buyer's needs and are priced well.`),
  P("The work showed that a useful application can be built entirely with free, open-source tools. It also showed the value of comparing simple models with complex ones: on this data the linear baseline was almost as good as XGBoost. Since the data used was synthetic, the main outcome is a working, tested pipeline that can be retrained on real data, and the numerical accuracy reported here should be confirmed on such data."),
  H2("4.2 Recommendations"),
  numbered2("Retrain and re-evaluate the models on real listing data (for example a public housing dataset or data from a partner portal), and report results with time-based splits to avoid look-ahead."),
  numbered2("Tune the hyperparameters with randomized or Bayesian search and add features such as latitude and longitude, neighbourhood facilities and listing date."),
  numbered2("Use quantile regression or conformal prediction to give price ranges that are valid for all price levels."),
  numbered2("Add SHAP explanations so users can see why a price was predicted."),
  numbered2("Collect user clicks and enquiries and learn the recommendation weights from them, moving towards a hybrid content and collaborative recommender."),
  numbered2("Move from SQLite to PostgreSQL, add authentication and rate limiting to the API, and put the application behind HTTPS before public use."),
  numbered2("Schedule periodic retraining so that the model follows the market."),
];

// ---- appendices ----
const codeFiles = [["generate_data.py", "Dataset generation and SQL loading"], ["train_model.py", "EDA, model training and evaluation"],
  ["predictor.py", "Prediction, SQL queries and recommendation engine"], ["api.py", "Flask REST API"], ["app.py", "Streamlit web application"]];
const mono = (t) => new Paragraph({ spacing: { line: 240, after: 0 }, children: [new TextRun({ text: t === "" ? " " : t, font: "Courier New", size: 16 })] });
const code = (txt) => txt.split("\n").map(mono);

const app = [
  H1("APPENDICES", "arabic"),
  P("Appendix 1: Project Structure and How to Run", { bold: true, align: AlignmentType.LEFT, after: 20 }),
  P("Appendix 2: SQL Schema and Queries", { bold: true, align: AlignmentType.LEFT, after: 20 }),
  P("Appendix 3: API Usage Examples", { bold: true, align: AlignmentType.LEFT, after: 20 }),
  P("Appendix 4: Deployment on AWS", { bold: true, align: AlignmentType.LEFT, after: 20 }),
  P("Appendix 5: Source Code", { bold: true, align: AlignmentType.LEFT, after: 20 }),
  H2("Appendix 1: Project Structure and How to Run"),
  ...code(`real_estate_project/
  generate_data.py       create dataset, load SQLite database
  train_model.py         EDA, train/evaluate models, save best model
  predictor.py           prediction + recommendation + SQL queries
  api.py                 Flask REST API
  app.py                 Streamlit web app
  make_report_assets.py  architecture figure, results for the report
  requirements.txt
  data/                  properties.csv, real_estate.db
  models/                price_model.joblib, model_meta.json
  outputs/               charts and result tables`),
  P("", { after: 120 }),
  ...code(`pip install -r requirements.txt
python generate_data.py        # creates data/properties.csv and data/real_estate.db
python train_model.py          # trains models, writes charts to outputs/
streamlit run app.py           # web app  -> http://localhost:8501
python api.py                  # REST API -> http://localhost:5000`),
  P("", { after: 120 }),
  P("To use a real dataset, replace data/properties.csv with a file having the same columns, then reload it into SQLite and rerun train_model.py."),
  H2("Appendix 2: SQL Schema and Queries"),
  ...code(`-- table created by pandas.to_sql from properties.csv
properties(property_id, city, locality, property_type, bhk, area_sqft,
           bathrooms, age_years, floor, total_floors, furnishing,
           metro_distance_km, gym, swimming_pool, parking, security,
           lift, garden, clubhouse, power_backup, price_inr)

CREATE INDEX idx_city  ON properties(city);
CREATE INDEX idx_price ON properties(price_inr);

-- recommendation pre-filter (parameterised)
SELECT * FROM properties
WHERE city = ? AND bhk >= ? AND price_inr BETWEEN ? AND ?;

-- market summary
SELECT city, COUNT(*) AS listings,
       ROUND(AVG(price_inr)/1e5,1) AS avg_price_lakh,
       ROUND(AVG(price_inr*1.0/area_sqft)) AS avg_price_per_sqft
FROM properties GROUP BY city ORDER BY avg_price_per_sqft DESC;`),
  H2("Appendix 3: API Usage Examples"),
  ...code(`curl -X POST http://localhost:5000/predict -H "Content-Type: application/json" \\
  -d '{"city":"Mumbai","locality":"Powai","property_type":"Apartment",
       "furnishing":"Furnished","bhk":2,"area_sqft":900,"bathrooms":2,"age_years":3}'

curl -X POST http://localhost:5000/recommend -H "Content-Type: application/json" \\
  -d '{"city":"Delhi","bhk":3,"max_budget":15000000,"top_n":3}'

curl http://localhost:5000/market`),
  H2("Appendix 4: Deployment on AWS"),
  numbered3("Launch an EC2 instance (Ubuntu 22.04, t2.micro or t3.small) and create a key pair."),
  numbered3("In the security group, allow SSH (22) from your IP and TCP 8501 (and 5000 for the API) as required."),
  numbered3("Connect over SSH, install Python 3 and pip, copy the project folder (scp or git clone) and run pip install -r requirements.txt."),
  numbered3("Run python generate_data.py and python train_model.py once (or copy the trained models folder)."),
  numbered3("Start the services: streamlit run app.py --server.port 8501 --server.address 0.0.0.0, and python api.py. Use tmux or systemd to keep them running."),
  numbered3("Open http://<EC2-public-IP>:8501. For public use, put a reverse proxy such as Nginx with HTTPS in front and run Flask under Gunicorn."),
  H2("Appendix 5: Source Code"),
  ...codeFiles.flatMap(([f, d]) => [
    new Paragraph({ keepNext: true, spacing: { before: 240, after: 80 }, children: [run(`${f} - ${d}`, { bold: true })] }),
    ...code(fs.readFileSync(f, "utf8").replace(/\t/g, "    ").trimEnd()),
  ]),
];

const refs = [
  H1("REFERENCES"),
  ...blank(2),
  ...[
    "Breiman, L. (2001). Random forests. Machine Learning, 45(1), 5-32.",
    "Chen, T. and Guestrin, C. (2016). XGBoost: A scalable tree boosting system. In Proceedings of the 22nd ACM SIGKDD International Conference on Knowledge Discovery and Data Mining, 785-794.",
    "Friedman, J. H. (2001). Greedy function approximation: A gradient boosting machine. Annals of Statistics, 29(5), 1189-1232.",
    "Hoerl, A. E. and Kennard, R. W. (1970). Ridge regression: Biased estimation for nonorthogonal problems. Technometrics, 12(1), 55-67.",
    "Hunter, J. D. (2007). Matplotlib: A 2D graphics environment. Computing in Science & Engineering, 9(3), 90-95.",
    "McKinney, W. (2010). Data structures for statistical computing in Python. In Proceedings of the 9th Python in Science Conference, 56-61.",
    "Pedregosa, F. et al. (2011). Scikit-learn: Machine learning in Python. Journal of Machine Learning Research, 12, 2825-2830.",
    "Waskom, M. L. (2021). seaborn: statistical data visualization. Journal of Open Source Software, 6(60), 3021.",
  ].map((t) => new Paragraph({ alignment: AlignmentType.LEFT, spacing: { line: 240, after: 160 }, indent: { left: 540, hanging: 540 }, children: [run(t)] })),
];

// ---- TOC / lists (built after content so entries are known) ----
function tocLine(text, page, level) {
  return new Paragraph({ spacing: { line: 360, after: 0 }, indent: { left: (level - 1) * 360 },
    tabStops: [{ type: TabStopType.RIGHT, position: CW, leader: LeaderType.DOT }],
    children: [new TextRun({ children: [text, new Tab(), String(page || "")], font: FONT, size: 24, bold: level === 1 })] });
}
const pageOf = (key) => (PAGEMAP[key] !== undefined ? PAGEMAP[key] : "");

// Pre-run content builders to populate toc/figs/tabs (already executed above because arrays are constants)
const LOT = "LIST OF TABLES", LOF = "LIST OF FIGURES", SYM = "LIST OF SYMBOLS, ABBREVIATIONS AND NOMENCLATURE", DECL = "DECLARATION";
[DECL, LOT, LOF, SYM].forEach((k) => keys.push({ key: k, kind: "roman" }));
const symPage = symbolsPage();
const tocEntries = [
  { level: 1, text: DECL }, { level: 1, text: "ABSTRACT" }, { level: 1, text: "ACKNOWLEDGEMENT" },
  { level: 1, text: LOT }, { level: 1, text: LOF }, { level: 1, text: SYM },
  ...toc.filter((e) => !e.prelim),
];
const tocPage = [
  PH("TABLE OF CONTENTS", false),
  ...tocEntries.map((e) => tocLine(e.text, pageOf(e.text), e.level)),
];
const lotPage = [PH(LOT, false), ...tabs.map((t) => tocLine(t, pageOf(t.split(":")[0] + ":"), 1))];
const lofPage = [PH(LOF, false), ...figs.map((t) => tocLine(t, pageOf(t.split(":")[0] + ":"), 1))];
// entries for the TOC page for the prelim headings after it
const preTocEntries = [];

// ---- assemble sections ----
const pageSize = { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1800, right: 1440 } };
const footer = (fmt) => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER,
  children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 22 })] })] });
const styles = {
  default: { document: { run: { font: FONT, size: 24 } } },
  paragraphStyles: [
    { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 32, bold: true }, paragraph: { outlineLevel: 0 } },
    { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 28, bold: true }, paragraph: { outlineLevel: 1 } },
    { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: FONT, size: 24, bold: true }, paragraph: { outlineLevel: 2 } },
  ],
};
const numbering = { config: [
  { reference: "bul", levels: [{ level: 0, format: "bullet", text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  { reference: "num1", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  { reference: "num2", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  { reference: "num3", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },

] };

const doc = new Document({
  creator: "Satish Kumar", title: "Real Estate Price Prediction and Recommendation System", styles, numbering,
  sections: [
    { properties: { page: pageSize }, children: titlePage }, // no page number
    { properties: { page: { ...pageSize, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } },
      footers: { default: footer() },
      children: [...declaration, ...abstract, ...ack, ...tocPage, ...lotPage, ...lofPage, ...symPage] },
    { properties: { page: { ...pageSize, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      footers: { default: footer() },
      children: [...ch1, ...ch2, ...ch3, ...ch4, ...app, ...refs] },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("Project_Report.docx", buf);
  fs.writeFileSync("outputs/keys.json", JSON.stringify(keys, null, 1));
  console.log("Report written. Abstract words:", abstractWords, "| headings:", toc.length, "| figures:", figs.length, "| tables:", tabs.length);
});
