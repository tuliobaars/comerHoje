#!/usr/bin/env python3
"""v1 baseline (Tesseract + OpenCV) on references/*.jpeg: the experiment that showed classical OCR
is not enough (ARCHITECTURE.md §3.2). The app reads with PaddleOCR on the device: tests/e2e/test_leitura.py.

Requires: tesseract (+ eng traineddata), pytesseract, opencv-contrib-python (cv2.barcode), Pillow, node.
The date parser used is the JS core extracted from docs/ARCHITECTURE.md (so the spec is what's tested).
Output: a Markdown table on stdout + docs/verification/ocr_results.json
ROIs are fractions of the EXIF-oriented image, chosen the way a user would drag the crop box.
"""
import json, pathlib, re, subprocess, tempfile, time
import cv2, numpy as np, pytesseract
from PIL import Image, ImageOps

RAIZ = pathlib.Path(__file__).resolve().parents[2]
REF = RAIZ / "references"
HOJE = "2026-11-11"                      # date the photos were taken (EXIF)

ROI_DATA = {  # (x0, y0, x1, y1)
    "leite.jpeg":        (0.24, 0.26, 0.55, 0.35),
    "molho_tomate.jpeg": (0.27, 0.69, 0.58, 0.76),
    "nhoque.jpeg":       (0.30, 0.63, 0.62, 0.72),
    "porco.jpeg":        (0.40, 0.59, 0.64, 0.69),
    "porco2.jpeg":       (0.31, 0.30, 0.72, 0.70),
}
ROI_EAN = {"molho_tomate.jpeg": (0.52, 0.53, 0.75, 0.70), "porco.jpeg": (0.60, 0.60, 0.88, 0.72)}

# --- JS core of the app (srcjs/core) -----------------------------------------------------
tmp = pathlib.Path(tempfile.mkdtemp()); (tmp / "core.js").write_text((RAIZ / "srcjs/core/comerhoje-core.js").read_text(encoding="utf-8"))
(tmp / "parse.js").write_text(
    "const c=require('./core.js');const t=require('fs').readFileSync(0,'utf8');"
    f"const r=c.extrairDatas(t,'{HOJE}');console.log(JSON.stringify({{validade:r.validade,"
    "confianca:r.confianca,fabricacao:r.fabricacao,pesagem:r.pesagem}));")

def parse(texto):
    r = subprocess.run(["node", str(tmp / "parse.js")], input=texto, capture_output=True, text=True, cwd=tmp)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[:600])
    return json.loads(r.stdout)

def carregar(nome):
    return ImageOps.exif_transpose(Image.open(REF / nome)).convert("RGB")

def clahe(im):
    g = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2GRAY)
    return Image.fromarray(cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(g))

def recortar(im, box):
    W, H = im.size; a, b, c, d = box
    return im.crop((int(a * W), int(b * H), int(c * W), int(d * H)))

def ocr(im, cfg=""):
    return " | ".join(l for l in pytesseract.image_to_string(im, lang="eng", config=cfg).splitlines() if l.strip())

det = cv2.barcode.BarcodeDetector()
def barcodes(im):
    bgr = np.array(im)[:, :, ::-1]; achados = set()
    for lado in (1000, 1600, 2400, max(bgr.shape[:2])):
        s = lado / max(bgr.shape[:2]); x = cv2.resize(bgr, None, fx=s, fy=s) if s < 1 else bgr
        for rot in (None, cv2.ROTATE_180):
            y = x if rot is None else cv2.rotate(x, rot)
            ok, info, tipos, _ = det.detectAndDecodeWithType(y)
            if ok:
                achados |= {i for i in info if i}
    return sorted(achados)

res = {}
for f in sorted(p.name for p in REF.glob("*.jpeg")):
    ex = Image.open(REF / f).getexif()
    im = carregar(f)
    r = {"tamanho": im.size, "orientacao_exif": ex.get(274), "gps_tags": len(ex.get_ifd(0x8825))}
    full = im.copy(); full.thumbnail((2048, 2048))
    t0 = time.time(); r["ocr_full"] = ocr(full)[:160]; r["t_full_s"] = round(time.time() - t0, 2)
    r["parse_full"] = parse(ocr(full))
    if f in ROI_DATA:
        roi = recortar(im, ROI_DATA[f]); melhor = None
        for rot in (0, 180):
            x = roi.rotate(rot, expand=True)
            t0 = time.time(); txt = ocr(clahe(x), "--psm 6"); dt = round(time.time() - t0, 2)
            p = parse(txt.replace(" | ", "\n"))
            cand = {"rot": rot, "ocr": txt[:160], "parse": p, "t_s": dt}
            pontos = (p["confianca"] or 0) + (0.5 if p["pesagem"] else 0)
            if melhor is None or pontos > melhor[0]:
                melhor = (pontos, cand)
        r["roi"] = melhor[1]
    r["ean_full"] = barcodes(im)
    if f in ROI_EAN:
        r["ean_roi"] = barcodes(recortar(im, ROI_EAN[f]))
    res[f] = r

(RAIZ / "docs/verification/ocr_results.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
print("| foto | EXIF orient. | GPS tags | full-frame → validade | ROI (rot) → validade / pesagem (conf) | t full / ROI | EAN |")
print("|---|---|---|---|---|---|---|")
for f, r in res.items():
    roi = r.get("roi")
    roi_txt = (f"{roi['rot']}° → {roi['parse']['validade']} / {roi['parse']['pesagem']} ({roi['parse']['confianca']})"
               if roi else "—")
    eans = sorted(set(r["ean_full"]) | set(r.get("ean_roi", [])))
    print(f"| {f} | {r['orientacao_exif']} | {r['gps_tags']} | {r['parse_full']['validade']} | {roi_txt} | "
          f"{r['t_full_s']} s / {roi['t_s'] if roi else '—'} s | {', '.join(eans) or '—'} |")
