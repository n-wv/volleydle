import psycopg2
from dotenv import load_dotenv
import os

load_dotenv(dotenv_path="cred.env")

try:
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT")
    )
    print("Connected Success")
    conn.close()
except Exception as e:
    print("Connection failed", e)

