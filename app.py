from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import hashlib
import datetime
import random
from dotenv import load_dotenv
import os

COUNTRY_TO_CONTINENT = {
    "Japan": "Asia",
    "China": "Asia",
    "Iran": "Asia",
    "France": "Europe",
    "Italy": "Europe",
    "Poland": "Europe",
    "United States": "North America",
    "Canada": "North America",
    "Brazil": "South America",
    "Argentina": "South America",
    "Egypt": "Africa",
    "Tunisia": "Africa",
    "Australia": "Oceania",
    # add Olympic countries only (small list)
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
    today = datetime.date.today().isoformat()
    seed = int(hashlib.sha256(today.encode()).hexdigest(), 16) % (10**8)
    random.seed(seed)

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM players;")
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

def get_continent(nationality):
    return COUNTRY_TO_CONTINENT.get(nationality, "Unknown")

@app.route("/")
def home():
    return "Volleydle API is running"

@app.route("/api/player-of-the-day", methods=["GET"])
def player_of_the_day():
    player = get_player_of_the_day()
    if not player:
        return jsonify({"error": "No player found"}), 404
    return jsonify(player)

@app.route("/api/players", methods=["GET"])
def all_players():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, nationality, position, birthdate, age, height_cm, picture_url, team_name, jersey_number, sex
        FROM players;
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

    # get target player
    target = get_player_of_the_day()

    # compare attributes
    feedback = {
        "name": guess_dict["name"],
        "nationality": guess_dict["nationality"] == target["nationality"],
        "position": guess_dict["position"] == target["position"],
        "age": "higher" if guess_dict["age"] < target["age"] else "lower" if guess_dict["age"] > target["age"] else "match",
        "height": "taller" if guess_dict["height_cm"] < target["height_cm"] else "shorter" if guess_dict["height_cm"] > target["height_cm"] else "match",
        "team": guess_dict["team_name"] == target["team_name"],
        "sex": guess_dict["sex"] == target["sex"],
        "jersey_number": ("higher" if guess_dict["jersey_number"] < target["jersey_number"] else "lower" if guess_dict["jersey_number"] > target["jersey_number"] else "match"),
        "continent": guess_dict["continent"] == target["continent"]
    }

    return jsonify({
        "guess": guess_dict,
        "feedback": feedback
    })

if __name__ == "__main__":
    app.run(debug=True)