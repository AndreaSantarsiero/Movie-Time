import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import streamlit as st



# ----------------------------
# Config
# ----------------------------
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

INST_TOTAL_FILENAME = "Installazioni_gcehdljihahllhbbngifpbkmghllfjio.csv"
UNINST_TOTAL_FILENAME = "Disinstallazioni_gcehdljihahllhbbngifpbkmghllfjio.csv"
INST_BY_REGION_FILENAME = "Installazioni per regione_gcehdljihahllhbbngifpbkmghllfjio.csv"
UNINST_BY_REGION_FILENAME = "Disinstallazioni per regione_gcehdljihahllhbbngifpbkmghllfjio.csv"
UNKNOWN_REGION_NAME = "Unknown"



# ----------------------------
# Helpers
# ----------------------------
def read_cws_csv(path: str) -> pd.DataFrame:
    """
    I CSV del Chrome Web Store spesso hanno una prima riga "titolo" / metadata.
    Nel tuo caso funzionava con skiprows=1.
    """
    df = pd.read_csv(path, skiprows=1)

    # Normalizza colonna data
    if "Data" not in df.columns:
        raise ValueError(f"Colonna 'Data' non trovata in {path}. Colonne: {list(df.columns)}")

    df["Data"] = pd.to_datetime(df["Data"], format="%d/%m/%y", dayfirst=True, errors="coerce")
    if df["Data"].isna().any():
        raise ValueError("Alcune date non sono state parse correttamente. Controlla il formato nel CSV.")

    # Assicura che le colonne numeriche siano numeriche
    for c in df.columns:
        if c == "Data":
            continue
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    return df



def to_long(df: pd.DataFrame, value_name: str) -> pd.DataFrame:
    value_cols = [c for c in df.columns if c != "Data"]
    return df.melt(id_vars=["Data"], value_vars=value_cols, var_name="Paese", value_name=value_name)



def compute_region_summary(inst_long: pd.DataFrame, uninst_long: pd.DataFrame) -> pd.DataFrame:
    inst_tot = inst_long.groupby("Paese", as_index=False)["Installazioni"].sum()
    uninst_tot = uninst_long.groupby("Paese", as_index=False)["Disinstallazioni"].sum()

    out = inst_tot.merge(uninst_tot, on="Paese", how="outer").fillna(0)
    out["Installazioni_nette"] = out["Installazioni"] - out["Disinstallazioni"]
    out["Tasso_disinstallazione"] = np.where(
        out["Installazioni"] > 0,
        out["Disinstallazioni"] / out["Installazioni"],
        np.nan
    )

    out = out.sort_values(["Installazioni", "Installazioni_nette"], ascending=[False, False]).reset_index(drop=True)
    return out



def compute_daily(inst_long: pd.DataFrame, uninst_long: pd.DataFrame) -> pd.DataFrame:
    daily_i = inst_long.groupby("Data", as_index=False)["Installazioni"].sum()
    daily_u = uninst_long.groupby("Data", as_index=False)["Disinstallazioni"].sum()

    daily = daily_i.merge(daily_u, on="Data", how="outer").fillna(0).sort_values("Data")
    daily["Net"] = daily["Installazioni"] - daily["Disinstallazioni"]
    daily["Net_cumulato"] = daily["Net"].cumsum()
    return daily



def plot_daily(daily: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.plot(daily["Data"], daily["Installazioni"], label="Installazioni")
    ax.plot(daily["Data"], daily["Disinstallazioni"], label="Disinstallazioni")
    ax.set_title("Andamento giornaliero: installazioni vs disinstallazioni", fontsize=14)
    ax.set_xlabel("Data", fontsize=12)
    ax.set_ylabel("Conteggio", fontsize=12)
    ax.tick_params(axis="both", labelsize=11)
    ax.legend(fontsize=11)
    fig.autofmt_xdate()
    fig.tight_layout()
    return fig



def plot_cum_net(daily: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(12, 4.5))
    ax.plot(daily["Data"], daily["Net_cumulato"])
    ax.set_title("Crescita netta cumulata (installazioni - disinstallazioni)", fontsize=14)
    ax.set_xlabel("Data", fontsize=12)
    ax.set_ylabel("Net cumulato", fontsize=12)
    ax.tick_params(axis="both", labelsize=11)
    fig.autofmt_xdate()
    fig.tight_layout()
    return fig



def plot_top_countries(summary: pd.DataFrame, metric: str, top_n: int = 25):
    """
    metric: "Installazioni", "Disinstallazioni", "Installazioni_nette"
    """
    df = summary.head(top_n).copy()

    fig, ax = plt.subplots(figsize=(12, 5))
    ax.bar(df["Paese"], df[metric], width=0.6)  # barre più strette -> più spazio tra colonne
    ax.set_title(f"Top {top_n} paesi per {metric}", fontsize=14)
    ax.set_xlabel("Paese", fontsize=12)
    ax.set_ylabel(metric, fontsize=12)
    ax.tick_params(axis="both", labelsize=11)
    ax.tick_params(axis="x", rotation=55)
    for label in ax.get_xticklabels():
        label.set_horizontalalignment("right")
    fig.tight_layout()
    return fig



# ----------------------------
# Streamlit App
# ----------------------------
st.set_page_config(page_title="CWS Installs/Uninstalls Analyzer", layout="wide")

# CSS per ingrandire testi Streamlit + tabella/dataframe
st.markdown(
    """
    <style>
      .block-container { padding-top: 1.2rem; }
      h1 { font-size: 2.1rem !important; }
      h2, h3 { font-size: 1.5rem !important; }
      p, li, label, div, span { font-size: 1.05rem; }
      /* Dataframe (tabella) */
      .stDataFrame, .stDataFrame * { font-size: 1.0rem !important; }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("Movie Time - Analisi Installazioni / Disinstallazioni")

with st.sidebar:
    st.header("Input CSV (auto da cartella data/)")
    st.caption(f"DATA_DIR: {DATA_DIR}")
    st.caption(f"- {INST_BY_REGION_FILENAME}")
    st.caption(f"- {UNINST_BY_REGION_FILENAME}")
    st.caption(f"- {INST_TOTAL_FILENAME}")
    st.caption(f"- {UNINST_TOTAL_FILENAME}")

    st.divider()
    top_n = st.slider("Top N paesi nei grafici a barre", min_value=5, max_value=50, value=25, step=1)

# Leggi i file dalla cartella data
inst_path = os.path.join(DATA_DIR, INST_BY_REGION_FILENAME)
uninst_path = os.path.join(DATA_DIR, UNINST_BY_REGION_FILENAME)
inst_total_path = os.path.join(DATA_DIR, INST_TOTAL_FILENAME)
uninst_total_path = os.path.join(DATA_DIR, UNINST_TOTAL_FILENAME)

inst_df = read_cws_csv(inst_path)
uninst_df = read_cws_csv(uninst_path)

inst_total_df = read_cws_csv(inst_total_path)
uninst_total_df = read_cws_csv(uninst_total_path)

inst_long = to_long(inst_df, "Installazioni")
uninst_long = to_long(uninst_df, "Disinstallazioni")

# Se totali != somma regioni, crea "Unknown" (a livello giornaliero)
total_daily_inst = (
    inst_total_df.assign(_total=inst_total_df.drop(columns=["Data"]).sum(axis=1))[["Data", "_total"]]
    .rename(columns={"_total": "Installazioni"})
)
total_daily_uninst = (
    uninst_total_df.assign(_total=uninst_total_df.drop(columns=["Data"]).sum(axis=1))[["Data", "_total"]]
    .rename(columns={"_total": "Disinstallazioni"})
)

regional_daily_inst = inst_long.groupby("Data", as_index=False)["Installazioni"].sum()
regional_daily_uninst = uninst_long.groupby("Data", as_index=False)["Disinstallazioni"].sum()

chk = (
    total_daily_inst.merge(regional_daily_inst, on="Data", how="outer", suffixes=("_totale", "_regioni"))
    .merge(total_daily_uninst, on="Data", how="outer")
    .merge(regional_daily_uninst, on="Data", how="outer", suffixes=("_totale", "_regioni"))
    .fillna(0)
)

diff_inst = chk["Installazioni_totale"] - chk["Installazioni_regioni"]
diff_uninst = chk["Disinstallazioni_totale"] - chk["Disinstallazioni_regioni"]

# Evita negativi (nel caso raro in cui le regioni sommino più del totale)
diff_inst = diff_inst.clip(lower=0)
diff_uninst = diff_uninst.clip(lower=0)

if (diff_inst != 0).any():
    inst_long = pd.concat(
        [
            inst_long,
            pd.DataFrame({"Data": chk["Data"], "Paese": UNKNOWN_REGION_NAME, "Installazioni": diff_inst}),
        ],
        ignore_index=True,
    )

if (diff_uninst != 0).any():
    uninst_long = pd.concat(
        [
            uninst_long,
            pd.DataFrame({"Data": chk["Data"], "Paese": UNKNOWN_REGION_NAME, "Disinstallazioni": diff_uninst}),
        ],
        ignore_index=True,
    )

summary = compute_region_summary(inst_long, uninst_long)
daily = compute_daily(inst_long, uninst_long)

# KPI in alto
total_inst = float(summary["Installazioni"].sum())
total_uninst = float(summary["Disinstallazioni"].sum())
total_net = float(summary["Installazioni_nette"].sum())
uninst_rate = (total_uninst / total_inst) if total_inst > 0 else np.nan

c1, c2, c3, c4 = st.columns(4)
c1.metric("Installazioni totali", f"{int(total_inst)}")
c2.metric("Disinstallazioni totali", f"{int(total_uninst)}")
c3.metric("Crescita netta", f"{int(total_net)}")
c4.metric("Tasso disinstallazione", f"{uninst_rate:.1%}" if not np.isnan(uninst_rate) else "n/a")

st.divider()

# Selettore paese
countries = ["(Tutti)"] + summary["Paese"].tolist()
selected = st.selectbox("Filtra per paese (opzionale)", options=countries, index=0)

if selected != "(Tutti)":
    inst_long_f = inst_long[inst_long["Paese"] == selected].copy()
    uninst_long_f = uninst_long[uninst_long["Paese"] == selected].copy()
    summary_f = summary[summary["Paese"] == selected].copy()
    daily_f = compute_daily(inst_long_f, uninst_long_f)
else:
    summary_f = summary
    daily_f = daily

# Tabelle + grafici
st.subheader("Riepilogo per paese")
display_summary = summary_f.copy()
if "Tasso_disinstallazione" in display_summary.columns:
    display_summary["Tasso_disinstallazione"] = display_summary["Tasso_disinstallazione"].map(
        lambda x: f"{x:.1%}" if pd.notna(x) else ""
    )
st.dataframe(display_summary, use_container_width=True, height=520)

st.subheader("Andamento nel tempo")
st.pyplot(plot_daily(daily_f), clear_figure=True)
st.pyplot(plot_cum_net(daily_f), clear_figure=True)

st.divider()

st.subheader("Top paesi (bar chart)")
colA, colB, colC = st.columns(3)
with colA:
    st.pyplot(plot_top_countries(summary, "Installazioni", top_n=top_n), clear_figure=True)
with colB:
    st.pyplot(plot_top_countries(summary, "Disinstallazioni", top_n=top_n), clear_figure=True)
with colC:
    st.pyplot(plot_top_countries(summary, "Installazioni_nette", top_n=top_n), clear_figure=True)

st.caption(
    "Nota: 'Installazioni_nette' = installazioni nel periodo - disinstallazioni nel periodo. "
    "Se compaiono paesi con disinstallazioni > installazioni, è possibile che l'installazione sia avvenuta prima "
    "dell'intervallo del report."
)
