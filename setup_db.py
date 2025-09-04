import psycopg2
from dotenv import load_dotenv
import os

load_dotenv(dotenv_path="cred.env")

conn = psycopg2.connect(
    host=os.getenv("DB_HOST"),
    database=os.getenv("DB_NAME"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    port=os.getenv("DB_PORT")
)
cur = conn.cursor()

create_table_sql = """
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    nationality TEXT NOT NULL,
    position TEXT,
    birthdate DATE,
    age INTEGER,
    height_cm INTEGER,
    picture_url TEXT,
    team_name TEXT,
    jersey_number INTEGER,
    sex TEXT
);
"""

cur.execute(create_table_sql)
conn.commit()
cur.close()
conn.close()