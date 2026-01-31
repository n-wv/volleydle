// src/App.js
import "./App.css";
import React, { useEffect, useState } from "react";
import { HIGHLIGHT_VIDEOS } from "./highlightVideos";

const DEFAULT_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  totalGuessesInWins: 0,
  oneShots: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null // UTC date string
};

function App() {
  const [guess, setGuess] = useState("");
  const [error, setError] = useState(null);

  // For fetching players
  const [allPlayers, setAllPlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);

  const [gameWon, setGameWon] = useState(false);
  const [winningPlayer, setWinningPlayer] = useState(null);
  const [showStats, setShowStats] = useState(false);

  const [timeLeft, setTimeLeft] = useState("");

  const [mode, setMode] = useState("men"); // "men" or "women"

  const getTodayUTC = () =>
    new Date().toISOString().slice(0, 10);

  // For saving stats locally (men/women)
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem("volleydleStats");
    return saved
      ? JSON.parse(saved)
      : {
          men: { ...DEFAULT_STATS },
          women: { ...DEFAULT_STATS }
        };
  });

  useEffect(() => {
    localStorage.setItem("volleydleStats", JSON.stringify(stats));
  }, [stats]);

  const [guessesByMode, setGuessesByMode] = useState(() => {
    const saved = localStorage.getItem("volleydleGuesses");
    if (saved) return JSON.parse(saved);
    return { men: [], women: [] };
  });

  // Persist guesses as well as stats
  useEffect(() => {
    localStorage.setItem("volleydleStats", JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem("volleydleGuesses", JSON.stringify(guessesByMode));
  }, [guessesByMode]);

  // Restore win state when mode changes
  useEffect(() => {
    const guesses = guessesByMode[mode] || [];
    const lastGuess = guesses[guesses.length - 1];

    if (lastGuess && lastGuess.is_correct) {
      setGameWon(true);
      setWinningPlayer(lastGuess.guess);
    } else {
      setGameWon(false);
      setWinningPlayer(null);
    }
  }, [mode, guessesByMode]);
  
  const currentGuesses = guessesByMode[mode] || [];

  const fetchPlayersForMode = () => {
    fetch(
      `https://volleydle-fucmazapa4d5dyax.westus-01.azurewebsites.net/api/players?mode=${mode}`
    )
      .then((res) => res.json())
      .then((data) => {
        const guessedIds = new Set(
          (guessesByMode[mode] || []).map(g => g.guess.id)
        );

        const remaining = data.filter(p => !guessedIds.has(p.id));
        setAllPlayers(remaining);
      })
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    // reset per-mode UI state
    setGuess("");
    setFilteredPlayers([]);
    setError(null);

    fetchPlayersForMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Handle user guess submission
  const handleGuess = () => {
    if (!guess) return;
    if (gameWon) return;

    fetch(
      `https://volleydle-fucmazapa4d5dyax.westus-01.azurewebsites.net/api/guess?name=${encodeURIComponent(guess)}&mode=${mode}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        setError(null);

        // Append the guess into the correct mode bucket and get new length
        setGuessesByMode((prev) => {
          const updatedModeGuesses = [...(prev[mode] || []), data];
          const newState = { ...prev, [mode]: updatedModeGuesses };

          // Persist happens via effect; now compute guessCount and call recordWin if correct
          if (data.is_correct) {
            // recordWin expects number of guesses it took to win
            const guessCount = updatedModeGuesses.length;
            recordWin(guessCount);
            setGameWon(true);
            setWinningPlayer(data.guess);
          }

          return newState;
        });

        // remove guessed player from autocomplete pool for current mode
        setAllPlayers((prev) => prev.filter((p) => p.id !== data.guess.id));

        // UI cleanup
        setFilteredPlayers([]);
        setGuess("");
      })
      .catch((err) => {
        console.error(err);
        setError("Network error");
      });
  };


  // Adjust list of players as user types
  const handleInputChange = (e) => {
    const value = e.target.value;
    setGuess(value);

    if (!value) {
      setFilteredPlayers([]);
      return;
    }

    const lower = value.toLowerCase();

    // Include nationality and team_name in search, limited to 30
    const filtered = allPlayers
      .filter(p =>
        (p.name || "").toLowerCase().includes(lower) ||
        (p.nationality || "").toLowerCase().includes(lower) ||
        (p.team_name || "").toLowerCase().includes(lower)
      )
      .slice(0, 30);

    setFilteredPlayers(filtered);
  };

  const recordWin = (guessCount) => {
    const today = getTodayUTC();

    setStats(prev => {
      const s = prev[mode] || { ...DEFAULT_STATS }; // guard
      const isNewDay = s.lastPlayedDate !== today;

      const newCurrentStreak = isNewDay
        ? s.currentStreak + 1
        : s.currentStreak;

      return {
        ...prev,
        [mode]: {
          ...s,
          gamesPlayed: s.gamesPlayed + (isNewDay ? 1 : 0),
          gamesWon: s.gamesWon + (isNewDay ? 1 : 0),
          totalGuessesInWins: s.totalGuessesInWins + (isNewDay ? guessCount : 0),
          oneShots: s.oneShots + (isNewDay && guessCount === 1 ? 1 : 0),
          currentStreak: newCurrentStreak,
          maxStreak: Math.max(s.maxStreak, newCurrentStreak),
          lastPlayedDate: today
        }
      };
    });
  };

  const recordLoss = () => {
    const today = getTodayUTC();

    setStats((prev) => {
      const s = prev[mode] || { ...DEFAULT_STATS };
      return {
        ...prev,
        [mode]: {
          ...s,
          gamesPlayed: s.gamesPlayed + 1,
          currentStreak: 0,
          lastPlayedDate: today
        }
      };
    });
  };



  // Get time until midnight for next game (UTC)
  const getTimeUntilNextUTC = () => {
    const now = new Date();

    const nextUTC = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0
      )
    );

    return nextUTC - now;
  };

  useEffect(() => {
    const tick = () => {
      const diff = getTimeUntilNextUTC();

      const hours = Math.floor(diff / 1000 / 60 / 60);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft(
        `${hours.toString().padStart(2, "0")}:` +
        `${minutes.toString().padStart(2, "0")}:` +
        `${seconds.toString().padStart(2, "0")}`
      );
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const renderArrow = (feedback) => {
    if (feedback === "match") return "";

    if (feedback === "higher") return "↓";
    if (feedback === "lower") return "↑";

    if (feedback === "higher_far") return "↓↓";
    if (feedback === "lower_far") return "↑↑";

    return "";
  };

  const getArrowColor = (feedback) => {
    if (feedback === "match") return "lightgreen";
    if (feedback && feedback.includes("far")) return "#ff8c00"; // dark orange
    return "lightyellow";
  };

  const getHighlightVideo = (player) => {
    if (!player) return null;

    const countryVideos = HIGHLIGHT_VIDEOS[player.nationality];
    if (!countryVideos) return null;

    return countryVideos[player.sex] || null;
  };

  // safe fallback if stats not present
  const currentStats = (stats && stats[mode]) ? stats[mode] : { ...DEFAULT_STATS };

  const winPercentage =
    currentStats.gamesPlayed > 0
      ? Math.round((currentStats.gamesWon / currentStats.gamesPlayed) * 100)
      : 0;

  const avgGuesses =
    currentStats.gamesWon > 0
      ? (currentStats.totalGuessesInWins / currentStats.gamesWon).toFixed(2)
      : "-";

  const highlightVideoId = gameWon
    ? getHighlightVideo(winningPlayer)
    : null;

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h1>Volleydle 🎮</h1>
      <p>Guess the Olympic volleyball player of the day!</p>

      <div style={{ marginBottom: "10px" }}>
        <button
          onClick={() => setMode("men")}
          disabled={mode === "men"}
        >
          Men's
        </button>

        <button
          onClick={() => setMode("women")}
          disabled={mode === "women"}
          style={{ marginLeft: "8px" }}
        >
          Women's
        </button>
      </div>

      <div style={{ position: "relative", width: "300px" }}>
        <input
          type="text"
          value={guess}
          onChange={handleInputChange}
          placeholder="Search player..."
          style={{ width: "100%" }}
        />

        {filteredPlayers.length > 0 && (
          <ul style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            border: "1px solid #ccc",
            position: "absolute",
            width: "100%",
            backgroundColor: "white",
            zIndex: 10,
            maxHeight: "200px",
            overflowY: "auto"       // enables scrolling
          }}>
            {filteredPlayers.map(player => (
              <li
                key={player.id}
                onClick={() => {
                  setGuess(player.name);
                  setFilteredPlayers([]);
                }}
                style={{
                  padding: "6px 8px",
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px"
                }}
              >
                <img
                  src={player.picture_url}
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = "/logo192.png";
                  }}
                  alt={player.name}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    objectFit: "cover"
                  }}
                />
                <div>
                  <div style={{ fontWeight: "bold" }}>{player.name}</div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    {player.nationality}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button onClick={handleGuess} disabled={gameWon || !guess}>
        Guess
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <table border="1" cellPadding="8" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>Player</th>
            <th>Nationality</th>
            <th>Position</th>
            <th>Age</th>
            <th>Height</th>
            <th>Jersey</th>
            <th>Continent</th>
            <th>Sex</th>
          </tr>
        </thead>
        <tbody>
          {currentGuesses.map((g, i) => (
            <tr key={i}>
              <td style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <img
                  src={g.guess.picture_url}
                  alt={g.guess.name}
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    objectFit: "cover"
                  }}
                />
                {g.guess.name}
              </td>
              <td style={{ backgroundColor: g.feedback.nationality ? "lightgreen" : "lightcoral" }}>
                {g.guess.nationality}
              </td>
              <td style={{ backgroundColor: g.feedback.position ? "lightgreen" : "lightcoral" }}>
                {g.guess.position}
              </td>
              <td style={{ backgroundColor: getArrowColor(g.feedback.age) }}>
                {g.guess.age} {renderArrow(g.feedback.age)}
              </td>
              <td style={{ backgroundColor: getArrowColor(g.feedback.height) }}>
                {g.guess.height_cm} cm {renderArrow(g.feedback.height)}
              </td>
              <td style={{ backgroundColor: getArrowColor(g.feedback.jersey_number) }}>
                #{g.guess.jersey_number} {renderArrow(g.feedback.jersey_number)}
              </td>
              <td style={{ backgroundColor: g.feedback.continent ? "lightgreen" : "lightcoral"}}>
                {g.guess.continent}
              </td>
              <td style={{ backgroundColor: g.feedback.sex ? "lightgreen" : "lightcoral" }}>
                {g.guess.sex}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {gameWon && winningPlayer && (
        <div style={{
          marginTop: "30px",
          padding: "20px",
          border: "2px solid #4caf50",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          gap: "20px",
          backgroundColor: "#e8f5e9"
        }}>
          <img
            src={winningPlayer.picture_url}
            alt={winningPlayer.name}
            style={{
              width: "120px",
              height: "120px",
              borderRadius: "50%",
              objectFit: "cover"
            }}
          />

          <div>
            <h2 style={{ margin: 0 }}>
              🎉 You got it!
            </h2>
            <h3 style={{ margin: "5px 0" }}>
              {winningPlayer.flag} {winningPlayer.name}
            </h3>
            <p style={{ margin: 0 }}>
              {winningPlayer.nationality} • {winningPlayer.position}
            </p>
            <p style={{ margin: 0 }}>
              Team: {winningPlayer.team_name}
            </p>
            <p style={{ margin: 0 }}>
              Jersey #{winningPlayer.jersey_number}
            </p>

            <button
              className="stats-button"
              onClick={() => setShowStats(true)}
            >
              📊 Stats
            </button>

            {showStats && (
              <div className="modal-overlay" onClick={() => setShowStats(false)}>
                <div className="modal" onClick={(e) => e.stopPropagation()}>
                  <h2>Your Stats ({mode === "men" ? "Men" : "Women"})</h2>

                  <p>Games Played: {currentStats.gamesPlayed}</p>
                  <p>Games Won: {currentStats.gamesWon}</p>
                  <p>Win %: {winPercentage}%</p>
                  <p>Avg Guesses: {avgGuesses}</p>
                  <p>One-Shots 🎯: {currentStats.oneShots}</p>
                  <p>Current Streak 🔥: {currentStats.currentStreak}</p>
                  <p>Max Streak 🏆: {currentStats.maxStreak}</p>

                  <button onClick={() => setShowStats(false)}>Close</button>
                </div>
              </div>
            )}

            {highlightVideoId && (
              <div style={{ marginTop: "15px" }}>
                <iframe
                  width="100%"
                  height="215"
                  src={`https://www.youtube.com/embed/${highlightVideoId}`}
                  title="Player highlights"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  style={{ borderRadius: "8px" }}
                />
              </div>
            )}
            <p style={{ marginTop: "8px", fontSize: "14px", color: "#666" }}>
              Next player in {timeLeft} (UTC)
            </p>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
