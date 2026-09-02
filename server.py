"""
Archivio Ricette — server locale.

Avvio:  python3 server.py            → raggiungibile anche dal telefono (stessa Wi-Fi)
        python3 server.py --local    → solo da questo computer

Dati:   recipes.json  (ricette)  ·  images/  (foto)
"""

import argparse
import json
import os
import re
import socket
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

# Il sito sta in docs/ perché è la cartella che GitHub Pages pubblica.
# Ricette e foto vivono lì dentro: il server scrive già dove il sito legge,
# così "pubblicare" è solo un git push, senza copiare niente in giro.
BASE_DIR   = Path(__file__).parent
WEB_DIR    = BASE_DIR / "docs"
DATA_DIR   = WEB_DIR / "data"
IMG_DIR    = WEB_DIR / "images"
DATA_FILE  = DATA_DIR / "recipes.json"
CFG_FILE   = DATA_DIR / "config.json"
BAK_FILE   = DATA_DIR / "recipes.bak.json"
PORT       = 8790

MAX_UPLOAD_MB = 12
ALLOWED_EXT   = {"jpg", "jpeg", "png", "webp", "gif", "heic", "avif"}


# ══════════════════════════════════════════════════════════════════════════════
#  TAG — L'UNICA PARTE DA MODIFICARE PER AGGIUNGERE ETICHETTE
#
#  I tag vivono qui, nel server: dall'interfaccia si possono solo SELEZIONARE,
#  mai creare o rinominare. Per aggiungerne uno basta una riga nuova:
#
#        ("id-univoco", "Etichetta visibile"),
#
#  L'id non va più cambiato (è quello salvato dentro le ricette);
#  l'etichetta invece si può riscrivere quando vuoi senza rompere nulla.
#  Per un gruppo nuovo, copia un blocco e cambia id / label / color / icon.
#
#  Per ora c'è solo "Proteico": la lista vera arriva quando la decidi tu.
#  Esempio di come si allunga, dentro "tags":
#
#        ("proteico",    "Proteico"),
#        ("veloce",      "Veloce"),
#        ("meal-prep",   "Meal prep"),
# ══════════════════════════════════════════════════════════════════════════════

TAG_GROUPS = [
    {
        "id": "dieta",
        "label": "Dieta",
        "color": "#2dd4bf",
        "icon": "\U0001f966",
        "tags": [
            ("proteico", "Proteico"),
        ],
    },
]

# ══════════════════════════════════════════════════════════════════════════════


def tag_index():
    """id tag → {id, label, group, color} per validare e colorare."""
    idx = {}
    for g in TAG_GROUPS:
        for tid, label in g["tags"]:
            idx[tid] = {"id": tid, "label": label, "group": g["id"], "color": g["color"]}
    return idx


def config_payload():
    return {"tag_groups": tags_payload(), "max_upload_mb": MAX_UPLOAD_MB}


def write_static_config():
    """La versione pubblicata non ha un server: i tag glieli lasciamo su file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with CFG_FILE.open("w", encoding="utf-8") as f:
        json.dump(config_payload(), f, ensure_ascii=False, indent=2)


def tags_payload():
    return [
        {
            "id": g["id"],
            "label": g["label"],
            "color": g["color"],
            "icon": g.get("icon", ""),
            "tags": [{"id": t, "label": l} for t, l in g["tags"]],
        }
        for g in TAG_GROUPS
    ]


# ── Persistenza ───────────────────────────────────────────────────────────────

def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_recipes():
    if not DATA_FILE.exists():
        return []
    try:
        with DATA_FILE.open(encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return []
    return data.get("recipes", []) if isinstance(data, dict) else data


def save_recipes(recipes):
    """Scrittura atomica + copia di sicurezza della versione precedente."""
    if DATA_FILE.exists():
        try:
            BAK_FILE.write_bytes(DATA_FILE.read_bytes())
        except OSError:
            pass
    payload = {"version": 1, "updated_at": now_iso(), "recipes": recipes}
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(DATA_DIR), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.chmod(tmp, 0o644)          # mkstemp crea 0600: il file dev'essere leggibile
        os.replace(tmp, DATA_FILE)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# ── Normalizzazione input ─────────────────────────────────────────────────────

def clean_lines(value, limit=200):
    """Lista di stringhe pulita: niente vuoti, niente duplicati di spazi."""
    if isinstance(value, str):
        value = value.split("\n")
    if not isinstance(value, list):
        return []
    out = []
    for item in value[:limit]:
        if not isinstance(item, (str, int, float)):
            continue
        text = re.sub(r"\s+", " ", str(item)).strip()
        if text:
            out.append(text[:400])
    return out


def clean_int(value, lo, hi):
    try:
        n = int(float(value))
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def normalize(body, existing=None):
    idx = tag_index()
    base = existing or {}

    name = re.sub(r"\s+", " ", str(body.get("name", "") or "")).strip()[:120]
    if not name:
        abort(400, "Il nome della ricetta è obbligatorio")

    tags = [t for t in (body.get("tags") or []) if t in idx]
    seen, uniq = set(), []
    for t in tags:
        if t not in seen:
            seen.add(t)
            uniq.append(t)

    image = body.get("image")
    if image is not None:
        image = str(image)[:300] if str(image).startswith("/images/") else None

    return {
        "id":          base.get("id") or uuid.uuid4().hex[:12],
        "name":        name,
        "image":       image,
        "tags":        uniq,
        "ingredients": clean_lines(body.get("ingredients")),
        "steps":       clean_lines(body.get("steps")),
        "notes":       str(body.get("notes", "") or "").strip()[:2000],
        "servings":    clean_int(body.get("servings"), 1, 50),
        "time_min":    clean_int(body.get("time_min"), 1, 1440),
        "favorite":    bool(body.get("favorite", base.get("favorite", False))),
        "created_at":  base.get("created_at") or now_iso(),
        "updated_at":  now_iso(),
    }


def drop_image(path):
    """Cancella il file immagine di una ricetta, se non lo usa nessun altro."""
    if not path or not str(path).startswith("/images/"):
        return
    name = os.path.basename(str(path))
    target = IMG_DIR / name
    if target.exists() and target.parent == IMG_DIR:
        try:
            target.unlink()
        except OSError:
            pass


# ── App ───────────────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024


@app.after_request
def no_cache(resp):
    if request.path.startswith("/api/") or request.path in ("/", "/index.html"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(WEB_DIR, filename)


@app.route("/images/<path:filename>")
def images(filename):
    return send_from_directory(IMG_DIR, filename, max_age=31536000)


@app.route("/api/config")
def api_config():
    return jsonify(config_payload())


@app.route("/api/recipes")
def api_list():
    return jsonify({"recipes": load_recipes()})


@app.route("/api/recipes", methods=["POST"])
def api_create():
    recipes = load_recipes()
    recipe = normalize(request.get_json(force=True, silent=True) or {})
    recipes.append(recipe)
    save_recipes(recipes)
    return jsonify(recipe), 201


@app.route("/api/recipes/<rid>", methods=["PUT"])
def api_update(rid):
    recipes = load_recipes()
    for i, r in enumerate(recipes):
        if r.get("id") == rid:
            updated = normalize(request.get_json(force=True, silent=True) or {}, existing=r)
            if r.get("image") and r["image"] != updated["image"]:
                drop_image(r["image"])
            recipes[i] = updated
            save_recipes(recipes)
            return jsonify(updated)
    abort(404, "Ricetta non trovata")


@app.route("/api/recipes/<rid>", methods=["DELETE"])
def api_delete(rid):
    recipes = load_recipes()
    keep = [r for r in recipes if r.get("id") != rid]
    if len(keep) == len(recipes):
        abort(404, "Ricetta non trovata")
    gone = next(r for r in recipes if r.get("id") == rid)
    save_recipes(keep)
    drop_image(gone.get("image"))
    return jsonify({"ok": True})


@app.route("/api/recipes/<rid>/favorite", methods=["POST"])
def api_favorite(rid):
    recipes = load_recipes()
    for r in recipes:
        if r.get("id") == rid:
            r["favorite"] = not r.get("favorite", False)
            r["updated_at"] = now_iso()
            save_recipes(recipes)
            return jsonify(r)
    abort(404, "Ricetta non trovata")


@app.route("/api/images", methods=["POST"])
def api_upload():
    file = request.files.get("image")
    if not file or not file.filename:
        abort(400, "Nessun file ricevuto")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    if ext not in ALLOWED_EXT:
        abort(400, "Formato immagine non supportato")
    name = "%s-%s.%s" % (time.strftime("%Y%m%d"), uuid.uuid4().hex[:10], ext)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    file.save(str(IMG_DIR / name))
    return jsonify({"url": "/images/" + name})


@app.errorhandler(400)
@app.errorhandler(404)
@app.errorhandler(413)
def errors(e):
    msg = getattr(e, "description", str(e))
    if getattr(e, "code", None) == 413:
        msg = "Immagine troppo pesante (max %d MB)" % MAX_UPLOAD_MB
    return jsonify({"error": msg}), getattr(e, "code", 500)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Archivio Ricette")
    parser.add_argument("--local", action="store_true",
                        help="accessibile solo da questo computer")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    write_static_config()
    host = "127.0.0.1" if args.local else "0.0.0.0"

    print("\n  🍳  ARCHIVIO RICETTE")
    print("  " + "─" * 44)
    print("  Su questo Mac →  http://localhost:%d" % args.port)
    if not args.local:
        ip = lan_ip()
        if ip:
            print("  Dal telefono  →  http://%s:%d" % (ip, args.port))
        print("  (aperto a chi è sulla tua stessa Wi-Fi · usa --local per chiudere)")
    print("  " + "─" * 44)
    print("  Ctrl+C per fermare.\n")

    app.run(host=host, port=args.port, debug=False)
