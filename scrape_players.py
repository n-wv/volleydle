import requests
from bs4 import BeautifulSoup
import psycopg2
from dotenv import load_dotenv
import os
from datetime import datetime

BASE_URL = "https://en.volleyballworld.com"
MEN_TEAMS_URL = f"{BASE_URL}/volleyball/competitions/volleyball-olympic-games-paris-2024/teams/men/"
WOMEN_TEAMS_URL = f"{BASE_URL}/volleyball/competitions/volleyball-olympic-games-paris-2024/teams/women/" 

CREATE_TABLE_SQL = """
DROP TABLE IF EXISTS players;

CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    nationality TEXT NOT NULL,
    position TEXT,
    birthdate DATE,
    age INTEGER,
    height_cm INTEGER,
    height_in INTEGER,
    picture_url TEXT,
    team_name TEXT,
    jersey_number INTEGER,
    sex TEXT,
    UNIQUE (name, team_name)
);
"""

# Obtains links to player lists for each country

def get_team_urls(teams_url):
    res = requests.get(teams_url)
    soup = BeautifulSoup(res.text, "html.parser")
    
    # Find all <a> tags with the specific class
    team_cards = soup.select("a.d3-l-col__col-2")
    
    teams = {}
    for card in team_cards:
        team_name = card.get("alt")
        original_href = card["href"]
        updated_href = '/'.join(original_href.rstrip('/').split('/')[:-1]) + '/players/'
        
        if team_name and updated_href:
            full_url = BASE_URL + updated_href
            teams[team_name] = full_url
    
    return teams

def parse_individual_player(url, country, sex):
    try:
        res = requests.get(url)
        soup = BeautifulSoup(res.text, "html.parser")

        name_tag = soup.find(["h3", "div"], class_="vbw-player-name")        
        name = name_tag.text.strip() if name_tag else None

        jersey_tag = soup.find("div", class_="vbw-player-no")
        jersey_number = int(jersey_tag.text.strip()) if jersey_tag and jersey_tag.text.strip().isdigit() else None

        picture_container = soup.find("div", class_="vbw-player-head")
        picture_url = None
        if picture_container:
            img_tag = picture_container.find("img")
            if img_tag and img_tag.has_attr("src"):
                picture_url = img_tag["src"]

        position = None
        nationality = None
        age = None
        birthdate = None
        height_cm = None
        height_in = None
        sex_info = sex

        bio_cols = soup.find_all("div", class_="vbw-player-bio-col")

        for col in bio_cols:
            head_tag = col.find("div", class_="vbw-player-bio-head")
            text_tag = col.find("div", class_="vbw-player-bio-text")

            if not head_tag or not text_tag:
                continue

            field = head_tag.text.strip().lower()
            value = text_tag.text.strip()

            if field == "position":
                position = value
            elif field == "nationality":
                nationality = value
            elif field == "age":
                try:
                    age = int(value)
                except:
                    age = None
            elif field == "birth date":
                try:
                    birthdate = datetime.strptime(value, "%d/%m/%Y").date()
                except:
                    birthdate = None
            elif field == "height":
                # value may have '202cm' or '202 cm', so strip non-numbers
                try:
                    height_cm = int(''.join(filter(str.isdigit, value)))
                    if height_cm:
                        height_in = round(height_cm / 2.54)
                    else:
                        height_in = None
                except:
                    height_cm = None

        return (
            name,
            nationality or country,  
            position,
            birthdate,
            age,
            height_cm,
            height_in,
            picture_url,
            country, 
            jersey_number,
            sex_info,       
        )

    except Exception as e:
        print(f"Error parsing player {url}: {e}")
        return None

def get_players_from_team(country_name: str, team_url: str, sex: str):
    res = requests.get(team_url)
    soup = BeautifulSoup(res.text, "html.parser")
    
    player_cells = soup.find_all("td", class_="vbw-o-table__cell playername")
    players = []

    for cell in player_cells:
        a_tag = cell.find("a", class_="d3-l-col__col-2")
        if a_tag and a_tag.get("href"):
            player_url = BASE_URL + a_tag["href"]
            try:
                player_data = parse_individual_player(player_url, country_name, sex)
                if player_data:
                    players.append(player_data)
            except Exception as e:
                print(f"Error getting player from {player_url}: {e}")
                
    return players

def insert_players(conn, players):
    with conn.cursor() as cur:
        insert_sql = """
        INSERT INTO players
        (name, nationality, position, birthdate, age, height_cm, height_in, picture_url, team_name, jersey_number, sex)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (name, team_name) DO NOTHING;
        """
        for p in players:
            cur.execute(insert_sql, p)
    conn.commit()

def main():
    load_dotenv(dotenv_path="cred.env")

    conn = psycopg2.connect(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        port=os.getenv("DB_PORT")
    )

    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
        conn.commit()
    print("Table reset complete.")

    total_players = 0
    men_teams = get_team_urls(MEN_TEAMS_URL)
    for country, url in men_teams.items():
        print(f"Scraping MEN team: {country}")
        players = get_players_from_team(country, url, sex="M")
        insert_players(conn, players)
        print(f"Inserted {len(players)} MEN players from {country}.")
        total_players += len(players)

    women_teams = get_team_urls(WOMEN_TEAMS_URL)
    for country, url in women_teams.items():
        print(f"Scraping WOMEN team: {country}")
        players = get_players_from_team(country, url, sex="F")
        insert_players(conn, players)
        print(f"Inserted {len(players)} WOMEN players from {country}.")
        total_players += len(players)

    print(f"Done! Inserted total {total_players} players.")

    conn.close()

if __name__ == "__main__":
    main()
