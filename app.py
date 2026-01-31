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

def get_db_connection():
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

def get_player_of_the_day():
    today = datetime.datetime.utcnow().date().isoformat()
    seed = int(hashlib.sha256(today.encode()).hexdigest(), 16) % (10**8)
    random.seed(seed)

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM players WHERE sex = %s;")
    player_ids = [row[0] for row in cur.fetchall()]

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
    player_dict["continent"] = get_continent(player_dict["nationality"])
    return player_dict

def compare_numeric(guess, target, close_threshold):
    diff = guess - target
    if diff == 0:
        return "match"
    if abs(diff) <= close_threshold:
        return "higher" if guess > target else "lower"
    
    return "higher_far" if guess > target else "lower_far"

def get_continent(nationality):
    return COUNTRY_TO_CONTINENT.get(nationality, "Unknown")

def get_flag(country):
    return COUNTRY_TO_FLAG.get(country, "")

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
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, nationality, position, birthdate, age, height_cm, picture_url, team_name, jersey_number, sex
        FROM players WHERE sex = %s;
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    keys = ["id", "name", "nationality", "position", "birthdate", "age",
            "height_cm", "picture_url", "team_name", "jersey_number", "sex"]
    players = []
    for row in rows:
        p = dict(zip(keys, row))
        p["continent"] = get_continent(p.get("nationality"))
        players.append(p)

    return jsonify(players)

@app.route("/api/guess", methods=["GET"])
def guess_player():
    name = request.args.get("name")
    if not name:
        return jsonify({"error": "No name provided"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, nationality, position, birthdate, age, height_cm, picture_url, team_name, jersey_number, sex
        FROM players
        WHERE LOWER(name) = LOWER(%s);
    """, (name,))
    guess = cur.fetchone()
    cur.close()
    conn.close()

    if not guess:
        return jsonify({"error": "Player not found"}), 404

    keys = ["id", "name", "nationality", "position", "birthdate", "age",
            "height_cm", "picture_url", "team_name", "jersey_number", "sex"]
    guess_dict = dict(zip(keys, guess))
    guess_dict["continent"] = get_continent(guess_dict["nationality"])
    guess_dict["flag"] = COUNTRY_TO_FLAG.get(guess_dict["nationality"], "")

    # get target player
    target = get_player_of_the_day()

    # compare attributes
    feedback = {
        "name": guess_dict["name"],
        "nationality": guess_dict["nationality"] == target["nationality"],
        "position": guess_dict["position"] == target["position"],
        "team": guess_dict["team_name"] == target["team_name"],
        "sex": guess_dict["sex"] == target["sex"],
        "continent": guess_dict["continent"] == target["continent"],
        
        "age": compare_numeric(
            guess_dict["age"], target["age"], close_threshold=2
        ),

        "height": compare_numeric(
            guess_dict["height_cm"], target["height_cm"], close_threshold=5
        ),

        "jersey_number": compare_numeric(
            guess_dict["jersey_number"], target["jersey_number"], close_threshold=3
        )
    }

    is_correct = guess_dict["id"] == target["id"]

    return jsonify({
        "guess": guess_dict,
        "feedback": feedback,
        "is_correct": is_correct
    })

if __name__ == "__main__":
    app.run(debug=True)