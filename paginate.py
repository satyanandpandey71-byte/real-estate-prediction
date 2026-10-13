"""Reads Project_Report.pdf, finds the page of every heading/caption, writes outputs/pagemap.json."""
import json
import re
import subprocess

keys = json.load(open("outputs/keys.json"))
n = int(re.search(r"Pages:\s+(\d+)", subprocess.check_output(["pdfinfo", "Project_Report.pdf"], text=True)).group(1))
pages = [subprocess.check_output(["pdftotext", "-f", str(i), "-l", str(i), "-layout", "Project_Report.pdf", "-"], text=True)
         for i in range(1, n + 1)]


def lines(p):
    return [re.sub(r"\s+", " ", l).strip() for l in pages[p].split("\n") if l.strip() and "...." not in l]


L = [lines(i) for i in range(n)]
# first arabic page = page whose lines contain "CHAPTER 1: INTRODUCTION" (not a TOC line)
ch1 = next(i for i in range(n) if "CHAPTER 1: INTRODUCTION" in L[i])
roman_vals = [("x", 10), ("ix", 9), ("v", 5), ("iv", 4), ("i", 1)]


def roman(k):
    s = ""
    for r, v in roman_vals:
        while k >= v:
            s += r; k -= v
    return s


pm = {}
for k in keys:
    key, kind = k["key"], k["kind"]
    probe = key[:24]
    found = None
    for i in range(n):
        if any(l.startswith(probe) for l in L[i]):
            found = i; break
    if found is None:
        print("NOT FOUND:", key); continue
    pm[key] = str(found - ch1 + 1) if kind in ("arabic", "fig", "tab") and found >= ch1 else roman(found)  # title page = pdf page 1 -> prelim i = pdf page 2
    if kind == "roman":
        pm[key] = roman(found)  # pdf page 2 is "i"
    if kind in ("fig", "tab") and found < ch1:
        pm[key] = roman(found)
json.dump(pm, open("outputs/pagemap.json", "w"), indent=1)
print("pages:", n, "first chapter pdf page:", ch1 + 1, "| mapped", len(pm), "of", len(keys))
