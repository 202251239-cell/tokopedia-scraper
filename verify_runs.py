#!/usr/bin/env python3
"""Verify tokopedia-scraper runs: item counts, field quality, no junk rows."""
import json
import subprocess
import sys
import time

TOKEN = open("/data/data/com.termux/files/home/.hermes/secrets/apify_token.txt").read().strip()
ACTOR = "NlbhozSpHLECr6DyQ"
BASE = "https://api.apify.com/v2"


def curl(path, method="GET", body=None):
    cmd = ["curl", "-s", "-X", method, "-H", f"Authorization: Bearer {TOKEN}"]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append(BASE + path)
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return json.loads(out, strict=False) if out.strip() else None


def start(query, pages=1):
    return curl(f"/acts/{ACTOR}/runs", "POST", {"searchTerms": query, "maxPages": pages})["data"]["id"]


def wait(rid, timeout=300):
    deadline = time.time() + timeout
    info = None
    while time.time() < deadline:
        info = curl(f"/acts/{ACTOR}/runs/{rid}")["data"]
        if info["status"] in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            return info
        time.sleep(15)
    return info


def main():
    queries = sys.argv[1:] or ["Baterai mi11t", "laptop gaming", "headset gaming"]
    rows = []
    for q in queries:
        rid = start(q)
        info = wait(rid)
        ds = info["defaultDatasetId"]
        kv = info.get("defaultKeyValueStoreId")
        items = curl(f"/datasets/{ds}/items") or []
        junk = [i for i in items if "_metadata" in i or not i.get("name")]
        summary = curl(f"/key-value-stores/{kv}/records/SUMMARY") if kv else None
        p = items[0] if items else {}
        rows.append((q, rid, info["status"], len(items), len(junk), info.get("usageTotalUsd", 0)))
        print(f"\n== {q} ==  run={rid}  status={info['status']}  cost=${info.get('usageTotalUsd',0):.5f}")
        print(f"   items={len(items)}  non-product rows={len(junk)}")
        print(f"   SUMMARY in KV: {str(summary)[:150]}")
        if p:
            print(f"   sample name : {str(p.get('name'))[:60]}")
            print(f"   price={p.get('price')} orig={p.get('originalPrice')} "
                  f"disc={p.get('discount')} disc%={p.get('discountPercent')}")
            print(f"   img={'yes' if p.get('imageUrl') else 'NO'} "
                  f"shop={str(p.get('shopName'))[:24]} rating={p.get('rating')} "
                  f"reviews={p.get('reviewCount')}")

    print("\n=== FINAL ===")
    for r in rows:
        print(f"  {r[0]:18} {r[2]:10} items={r[3]:3} junk={r[4]}  ${r[5]:.5f}")


if __name__ == "__main__":
    main()
