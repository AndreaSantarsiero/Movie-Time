import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import streamlit as st



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
    fig, ax = plt.subplots()
    ax.plot(daily["Data"], daily["Installazioni"], label="Installazioni")
    ax.plot(daily["Data"], daily["Disinstallazioni"], label="Disinstallazioni")
    ax.set_title("Andamento giornaliero: installazioni vs disinstallazioni")
    ax.set_xlabel("Data")
    ax.set_ylabel("Conteggio")
    ax.legend()
    fig.autofmt_xdate()
    return fig



def plot_cum_net(daily: pd.DataFrame):
    fig, ax = plt.subplots()
    ax.plot(daily["Data"], daily["Net_cumulato"])
    ax.set_title("Crescita netta cumulata (installazioni - disinstallazioni)")
    ax.set_xlabel("Data")
    ax.set_ylabel("Net cumulato")
    fig.autofmt_xdate()
    return fig



def plot_top_countries(summary: pd.DataFrame, metric: str, top_n: int = 15):
    """
    metric: "Installazioni", "Disinstallazioni", "Installazioni_nette"
    """
    df = summary.head(top_n).copy()

    fig, ax = plt.subplots()
    ax.bar(df["Paese"], df[metric])
    ax.set_title(f"Top {top_n} paesi per {metric}")
    ax.set_xlabel("Paese")
    ax.set_ylabel(metric)
    ax.tick_params(axis="x", rotation=45)
    fig.tight_layout()
    return fig



# ----------------------------
# Streamlit App
# ----------------------------
st.set_page_config(page_title="CWS Installs/Uninstalls Analyzer", layout="wide")

st.title("Chrome Web Store — Analisi Installazioni / Disinstallazioni per Paese")

with st.sidebar:
    st.header("Input CSV")
    inst_file = st.file_uploader("CSV Installazioni per regione", type=["csv"])
    uninst_file = st.file_uploader("CSV Disinstallazioni per regione", type=["csv"])

    st.divider()
    top_n = st.slider("Top N paesi nei grafici a barre", min_value=5, max_value=50, value=15, step=1)

if not inst_file or not uninst_file:
    st.info("Carica entrambi i CSV per iniziare.")
    st.stop()

# Leggi i file caricati
# Streamlit fornisce un file-like object: lo passiamo a pandas.
inst_df = pd.read_csv(inst_file, skiprows=1)
uninst_df = pd.read_csv(uninst_file, skiprows=1)

# Parse e pulizia (riusiamo logica, ma con df già letto)
def normalize_loaded_df(df: pd.DataFrame) -> pd.DataFrame:
    if "Data" not in df.columns:
        raise ValueError(f"Colonna 'Data' non trovata. Colonne: {list(df.columns)}")
    df["Data"] = pd.to_datetime(df["Data"], format="%d/%m/%y", dayfirst=True, errors="coerce")
    for c in df.columns:
        if c != "Data":
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    return df

inst_df = normalize_loaded_df(inst_df)
uninst_df = normalize_loaded_df(uninst_df)

inst_long = to_long(inst_df, "Installazioni")
uninst_long = to_long(uninst_df, "Disinstallazioni")

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
left, right = st.columns([1.1, 1])

with left:
    st.subheader("Riepilogo per paese")
    # Formatta percentuale
    display_summary = summary_f.copy()
    if "Tasso_disinstallazione" in display_summary.columns:
        display_summary["Tasso_disinstallazione"] = display_summary["Tasso_disinstallazione"].map(
            lambda x: f"{x:.1%}" if pd.notna(x) else ""
        )
    st.dataframe(display_summary, use_container_width=True, height=420)

with right:
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
