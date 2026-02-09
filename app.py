# server.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import hashlib
import datetime
import random
from dotenv import load_dotenv
import os


COUNTRY_TO_CONTINENT = {
    "Argentina": "South America",
    "Brazil": "South America",
    "Canada": "North America",
    "United States": "North America",
    "Dominican Republic": "North America",
    "China": "Asia",
    "Japan": "Asia",
    "Türkiye": "Europe",
    "France": "Europe",
    "Germany": "Europe",
    "Italy": "Europe",
    "Netherlands": "Europe",
    "Poland": "Europe",
    "Serbia": "Europe",
    "Slovenia": "Europe",
    "Egypt": "Africa",
    "Kenya": "Africa"
}

COUNTRY_TO_FLAG = {
    "Argentina": "🇦🇷",
    "Brazil": "🇧🇷",
    "Canada": "🇨🇦",
    "China": "🇨🇳",
    "Dominican Republic": "🇩🇴",
    "Egypt": "🇪🇬",
    "France": "🇫🇷",
    "Germany": "🇩🇪",
    "Italy": "🇮🇹",
    "Japan": "🇯🇵",
    "Kenya": "🇰🇪",
    "Netherlands": "🇳🇱",
    "Poland": "🇵🇱",
    "Serbia": "🇷🇸",
    "Slovenia": "🇸🇮",
    "Türkiye": "🇹🇷",
    "United States": "🇺🇸"
}

app = Flask(__name__)
CORS(app)

CORS(app, origins=["https://mango-plant-0c2fcb01e.4.azurestaticapps.net", "http://localhost:3000", "https://www.volleydle.com"])

def get_db_connection():
    # load local cred.env if present (dev)
    if os.path.exists("cred.env"):
        load_dotenv("cred.env")

    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT"),
        sslmode=os.getenv("SSLMODE", "require")
    )
    return conn

def get_continent(nationality):
    return COUNTRY_TO_CONTINENT.get(nationality, "Unknown")

def get_flag(country):
    return COUNTRY_TO_FLAG.get(country, "")

def get_player_of_the_day(sex="M"):
    """
    Return a dict for the deterministic player of the day for the given sex ('M' or 'F').
    """
    # Use UTC date + sex in the seed so men/women differ
    today = datetime.datetime.utcnow().date().isoformat()
    seed_str = f"{today}-{sex}"
    seed = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (10**8)
    random.seed(seed)

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM players WHERE sex = %s;", (sex,))
    rows = cur.fetchall()
    player_ids = [r[0] for r in rows]

    if not player_ids:
        cur.close()
        conn.close()
        return None

    chosen_id = random.choice(player_ids)

    cur.execute("""
        SELECT id, name, nationality, position, birthdate, age, height_cm, picture_url, team_name, jersey_number, sex
        FROM players
        WHERE id = %s;
    """, (chosen_id,))
    player = cur.fetchone()

    cur.close()
    conn.close()

    if not player:
        return None

    keys = ["id", "name", "nationality", "position", "birthdate", "age",
            "height_cm", "picture_url", "team_name", "jersey_number", "sex"]
    player_dict = dict(zip(keys, player))
    player_dict["continent"] = get_continent(player_dict.get("nationality"))
    player_dict["flag"] = get_flag(player_dict.get("nationality"))
    return player_dict

def compare_numeric(guess, target, close_threshold):
    # If either value missing, return None (frontend should treat missing gracefully)
    if guess is None or target is None:
        return None
    try:
        diff = int(guess) - int(target)
    except Exception:
        return None

    if diff == 0:
        return "match"
    if abs(diff) <= close_threshold:
        return "higher" if guess > target else "lower"
    return "higher_far" if guess > target else "lower_far"

@app.route("/")
def home():
    return "Volleydle API is running"

@app.route("/api/player-of-the-day", methods=["GET"])
def player_of_the_day():
    mode = request.args.get("mode", "men")
    sex = "M" if mode == "men" else "F"

    player = get_player_of_the_day(sex=sex)

    if not player:
        return jsonify({"error": "No player found"}), 404

    return jsonify(player)

@app.route("/api/players", methods=["GET"])
def all_players():
    mode = request.args.get("mode", "men")
    sex = "M" if mode == "men" else "F"

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, nationality, position, birthdate, age, height_cm, picture_url, team_name, jersey_number, sex
        FROM players WHERE sex = %s;
    """, (sex,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    keys = ["id", "name", "nationality", "position", "birthdate", "age",
            "height_cm", "picture_url", "team_name", "jersey_number", "sex"]
    players = []
    for row in rows:
        p = dict(zip(keys, row))
        p["continent"] = get_continent(p.get("nationality"))
        p["flag"] = get_flag(p.get("nationality"))
        players.append(p)

    return jsonify(players)

@app.route("/api/guess", methods=["GET"])
def guess_player():
    name = request.args.get("name")
    mode = request.args.get("mode", "men")
    sex = "M" if mode == "men" else "F"

    if not name:
        return jsonify({"error": "No name provided"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    # ensure we only find players of the correct sex
    cur.execute("""
        SELECT id, name, nationality, position, birthdate, age, height_cm, picture_url, team_name, jersey_number, sex
        FROM players
        WHERE LOWER(name) = LOWER(%s) AND sex = %s;
    """, (name, sex))
    guess = cur.fetchone()
    cur.close()
    conn.close()

    if not guess:
        return jsonify({"error": "Player not found for this mode"}), 404

    keys = ["id", "name", "nationality", "position", "birthdate", "age",
            "height_cm", "picture_url", "team_name", "jersey_number", "sex"]
    guess_dict = dict(zip(keys, guess))
    guess_dict["continent"] = get_continent(guess_dict.get("nationality"))
    guess_dict["flag"] = get_flag(guess_dict.get("nationality"))

    # get target player for this mode
    target = get_player_of_the_day(sex=sex)
    if not target:
        return jsonify({"error": "No target player configured"}), 500

    # compare attributes
    feedback = {
        "name": guess_dict["name"],
        "nationality": guess_dict["nationality"] == target["nationality"],
        "position": guess_dict["position"] == target["position"],
        "team": guess_dict["team_name"] == target["team_name"],
        "sex": guess_dict["sex"] == target["sex"],
        "continent": guess_dict["continent"] == target["continent"],
        "age": compare_numeric(guess_dict.get("age"), target.get("age"), close_threshold=2),
        "height": compare_numeric(guess_dict.get("height_cm"), target.get("height_cm"), close_threshold=5),
        "jersey_number": compare_numeric(guess_dict.get("jersey_number"), target.get("jersey_number"), close_threshold=3)
    }

    is_correct = guess_dict["id"] == target["id"]

    return jsonify({
        "guess": guess_dict,
        "feedback": feedback,
        "is_correct": is_correct
    })

if __name__ == "__main__":
    # In production you will use gunicorn; this is for local dev only
    app.run(debug=True)
