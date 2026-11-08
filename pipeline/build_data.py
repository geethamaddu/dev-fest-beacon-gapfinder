"""Beacon Gap Finder data pipeline.

Joins the Beacon example datasets with Census TIGERweb tract boundaries for the
three Beacon regions and writes one GeoJSON file per region for the React app:

  app/public/data/central-florida.geojson
  app/public/data/nyc.geojson
  app/public/data/salt-lake-city.geojson

Inputs (in rawdata/):
  Population - Below Poverty Level/*S1701-Data.csv            poverty rate
  Households and Households Receiving SNAP Census, S2201/...  SNAP participation
  Total Population/*S0101-Data.csv                             population
  SRAM Straight Line Distance Data.csv                         USDA LILA (1/2 mile urban, 10 miles rural)
  Transportation_PLACES_*.csv                                  CDC no-reliable-transportation (NYC, SLC only)

Usage: python pipeline/build_data.py [rawdata folder]   (defaults to ../rawdata)
"""
import csv
import glob
import json
import os
import sys
import urllib.parse
import urllib.request

REGIONS = {
    "central-florida": {"state": "12", "offset": "0.0003",
                        "counties": {"095": "Orange", "117": "Seminole", "097": "Osceola", "069": "Lake"}},
    "nyc": {"state": "36", "offset": "0.00015",
            "counties": {"005": "Bronx", "047": "Brooklyn", "061": "Manhattan", "081": "Queens", "085": "Staten Island"}},
    "salt-lake-city": {"state": "49", "offset": "0.0003",
                       "counties": {"035": "Salt Lake", "045": "Tooele"}},
}
PREFIXES = {r["state"] + c for r in REGIONS.values() for c in r["counties"]}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "app", "public", "data")
TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query?"


def num(v):
    try:
        f = float(v)
        return f if f >= 0 else None  # ACS uses negative codes for missing
    except (TypeError, ValueError):
        return None


def read_acs(path, cols):
    rows = {}
    with open(path, encoding="utf-8-sig") as f:
        r = csv.DictReader(f)
        next(r)  # second header row = labels
        for row in r:
            geoid = row["GEO_ID"][-11:]
            if geoid[:5] in PREFIXES:
                rows[geoid] = {k: num(row.get(c)) for k, c in cols.items()}
    return rows


def read_fara(path, cols):
    rows = {}
    with open(path, encoding="latin-1") as f:
        for row in csv.DictReader(f):
            row = {k.lstrip("﻿\xef\xbb\xbf"): v for k, v in row.items()}
            geoid = row["CensusTract20"].zfill(11)
            if geoid[:5] in PREFIXES:
                rows[geoid] = {k: num(row.get(c)) for k, c in cols.items()}
    return rows


def read_places(path):
    rows = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            geoid = row["TractFIPS"].zfill(11)
            if geoid[:5] in PREFIXES:
                rows[geoid] = {"no_transport_pct": num(row.get("LACKTRPT_CrudePrev"))}
    return rows


def fetch_tracts(region):
    where = "STATE='%s' AND COUNTY IN (%s)" % (
        region["state"], ",".join("'%s'" % c for c in region["counties"]))
    feats, offset, page = [], 0, 1000
    while True:
        q = urllib.parse.urlencode({
            "where": where, "outFields": "GEOID", "returnGeometry": "true", "outSR": "4326",
            "geometryPrecision": "5", "maxAllowableOffset": region["offset"],
            "resultOffset": offset, "resultRecordCount": page, "orderByFields": "GEOID", "f": "geojson",
        })
        with urllib.request.urlopen(TIGER + q, timeout=180) as resp:
            batch = json.load(resp).get("features", [])
        feats += batch
        if len(batch) < page:
            return feats
        offset += page


def main(src):
    one = lambda pat: glob.glob(os.path.join(src, pat))[0]
    pov = read_acs(one("Population - Below Poverty Level/*S1701-Data.csv"), {
        "poverty_pct": "S1701_C03_001E", "poverty_moe": "S1701_C03_001M"})
    snap = read_acs(one("Households and Households Receiving SNAP Census, S2201/*S2201-Data.csv"), {
        "households": "S2201_C01_001E", "snap_pct": "S2201_C04_001E",
        "poor_hh": "S2201_C01_021E", "poor_hh_no_snap": "S2201_C05_021E"})
    pop = read_acs(one("Total Population/*S0101-Data.csv"), {"population": "S0101_C01_001E"})
    fara = read_fara(one("SRAM Straight Line Distance Data.csv"), {
        "lila_half_10": "SD_SRAM_LILATracts_halfAnd10", "far_half_share": "SD_SRAM_lapophalfshare"})
    places = read_places(one("Transportation_PLACES*.csv"))

    os.makedirs(OUT_DIR, exist_ok=True)
    for rid, region in REGIONS.items():
        feats = []
        for ft in fetch_tracts(region):
            g = ft["properties"]["GEOID"]
            p = {"geoid": g, "county": region["counties"].get(g[2:5], "")}
            for rows in (pov, snap, pop, fara, places):
                p.update(rows.get(g, {}))
            ph, pn = p.get("poor_hh"), p.get("poor_hh_no_snap")
            p["poor_no_snap_pct"] = round(100 * pn / ph, 1) if ph and pn is not None else None
            if p.get("far_half_share") is not None:
                p["far_half_share"] = round(p["far_half_share"], 1)
            feats.append({"type": "Feature", "properties": p, "geometry": ft["geometry"]})
        out = os.path.join(OUT_DIR, rid + ".geojson")
        with open(out, "w") as f:
            json.dump({"type": "FeatureCollection", "features": feats}, f, separators=(",", ":"))
        has = lambda k: sum(1 for x in feats if x["properties"].get(k) is not None)
        print(f"{rid}: {len(feats)} tracts, poverty {has('poverty_pct')}, LILA {has('lila_half_10')}, "
              f"transport {has('no_transport_pct')} -> {os.path.normpath(out)} ({os.path.getsize(out)//1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "rawdata"))
