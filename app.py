from flask import Flask, jsonify
import psycopg2
import hashlib
import datetime
import random
from dotenv import load_dotenv
import os


app = Flask(__name__)

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
    return dict(zip(keys, player))


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
    players = [dict(zip(keys, row)) for row in rows]

    return jsonify(players)

if __name__ == "__main__":
    app.run(debug=True)