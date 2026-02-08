// src/App.js
import "./App.css";
import React, { useEffect, useState } from "react";
import { HIGHLIGHT_VIDEOS } from "./highlightVideos";

/* -------------------------------------------------------------------------- */
/*                                   Constants                                */
/* -------------------------------------------------------------------------- */

const DEFAULT_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  totalGuessesInWins: 0,
  oneShots: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null // UTC date string
};

/* -------------------------------------------------------------------------- */
/*                                    App                                     */
/* -------------------------------------------------------------------------- */

function App() {
  const DEFAULT_PLAYER_IMAGE = "/default-player.png"; // /public fallback image
  const API_URL = process.env.REACT_APP_API_URL;

  /* ---------------------------------- State --------------------------------- */

  const [guess, setGuess] = useState("");
  const [error, setError] = useState(null);

  const [allPlayers, setAllPlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);

  const [gameWon, setGameWon] = useState(false);
  const [winningPlayer, setWinningPlayer] = useState(null);

  const [showStats, setShowStats] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const [timeLeft, setTimeLeft] = useState("");

  const [mode, setMode] = useState("men");

  /* ---------------------------------- Utils --------------------------------- */

  const getTodayUTC = () =>
    new Date().toISOString().slice(0, 10);

  /* ------------------------------ Player Stats ------------------------------ */

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

  /* ------------------------------ Daily Guesses ------------------------------ */

  const [guessesByMode, setGuessesByMode] = useState(() => {
    const saved = localStorage.getItem("volleydleGuesses");
    const today = getTodayUTC();

    if (!saved) {
      return { date: today, men: [], women: [] };
    }

    const parsed = JSON.parse(saved);

    if (parsed.date !== today) {
      return { date: today, men: [], women: [] };
    }

    return parsed;
  });

  /* ---------------------------- Daily Reset Logic ---------------------------- */

  useEffect(() => {
    const checkDate = () => {
      const today = getTodayUTC();

      setGuessesByMode(prev => {
        if (prev.date === today) return prev;

        const yesterdayMen = prev.men || [];
        const yesterdayWomen = prev.women || [];

        const didWinMen = yesterdayMen.some(g => g.is_correct);
        const didWinWomen = yesterdayWomen.some(g => g.is_correct);

        setStats(prevStats => ({
          men: {
            ...prevStats.men,
            currentStreak: didWinMen ? prevStats.men.currentStreak : 0
          },
          women: {
            ...prevStats.women,
            currentStreak: didWinWomen ? prevStats.women.currentStreak : 0
          }
        }));

        setGameWon(false);
        setWinningPlayer(null);

        return {
          date: today,
          men: [],
          women: []
        };
      });
    };

    checkDate();
    const interval = setInterval(checkDate, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  /* ----------------------------- Persist Guesses ----------------------------- */

  useEffect(() => {
    localStorage.setItem(
      "volleydleGuesses",
      JSON.stringify(guessesByMode)
    );
  }, [guessesByMode]);

  /* -------------------------- Restore Win Per Mode --------------------------- */

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

  /* ---------------------------- Fetch Player List ---------------------------- */

  const fetchPlayersForMode = () => {
    fetch(`${API_URL}/api/players?mode=${mode}`)
      .then(res => res.json())
      .then(data => {
        const guessedIds = new Set(
          (guessesByMode[mode] || []).map(g => g.guess.id)
        );

        const remaining = data.filter(p => !guessedIds.has(p.id));
        setAllPlayers(remaining);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    setGuess("");
    setFilteredPlayers([]);
    setError(null);
    fetchPlayersForMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /* ------------------------------ Guess Handling ----------------------------- */

  const handleGuess = () => {
    if (!guess || gameWon) return;

    fetch(
      `${API_URL}/api/guess?name=${encodeURIComponent(guess)}&mode=${mode}`
    )
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
          return;
        }

        setError(null);

        setGuessesByMode(prev => {
          const updated = [...(prev[mode] || []), data];

          if (data.is_correct) {
            recordWin(updated.length);
            setGameWon(true);
            setWinningPlayer(data.guess);
          }

          return { ...prev, [mode]: updated };
        });

        setAllPlayers(prev =>
          prev.filter(p => p.id !== data.guess.id)
        );

        setFilteredPlayers([]);
        setGuess("");
      })
      .catch(() => setError("Network error"));
  };

  /* ----------------------------- Autocomplete ----------------------------- */

  const normalizeText = (str = "") =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const handleInputChange = e => {
    const value = e.target.value;
    setGuess(value);

    if (!value) {
      setFilteredPlayers([]);
      return;
    }

    const search = normalizeText(value);

    const filtered = allPlayers
      .filter(
        p =>
          normalizeText(p.name).includes(search) ||
          normalizeText(p.nationality).includes(search) ||
          normalizeText(p.team_name).includes(search)
      )
      .slice(0, 30);

    setFilteredPlayers(filtered);
  };

  /* ------------------------------ Stats Logic ------------------------------- */

  const recordWin = guessCount => {
    const today = getTodayUTC();

    setStats(prev => {
      const s = prev[mode] || { ...DEFAULT_STATS };
      const isNewDay = s.lastPlayedDate !== today;

      const newStreak = isNewDay
        ? s.currentStreak + 1
        : s.currentStreak;

      return {
        ...prev,
        [mode]: {
          ...s,
          gamesPlayed: s.gamesPlayed + (isNewDay ? 1 : 0),
          gamesWon: s.gamesWon + (isNewDay ? 1 : 0),
          totalGuessesInWins:
            s.totalGuessesInWins + (isNewDay ? guessCount : 0),
          oneShots:
            s.oneShots + (isNewDay && guessCount === 1 ? 1 : 0),
          currentStreak: newStreak,
          maxStreak: Math.max(s.maxStreak, newStreak),
          lastPlayedDate: today
        }
      };
    });
  };

  /* ----------------------------- Countdown Timer ----------------------------- */

  const getTimeUntilNextUTC = () => {
    const now = new Date();
    const nextUTC = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0
      )
    );
    return nextUTC - now;
  };

  useEffect(() => {
    const tick = () => {
      const diff = getTimeUntilNextUTC();

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff / 60000) % 60);
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

  /* ------------------------------ Visual Helpers ----------------------------- */

  const renderArrow = feedback => {
    if (feedback === "match") return "";
    if (feedback === "higher") return "↓";
    if (feedback === "lower") return "↑";
    if (feedback === "higher_far") return "↓↓";
    if (feedback === "lower_far") return "↑↑";
    return "";
  };

  const getArrowClass = feedback => {
    switch (feedback) {
      case "match":
        return "good";
      case "higher":
      case "lower":
        return "warn";
      case "higher_far":
      case "lower_far":
        return "near";
      default:
        return "bad";
    }
  };

  const getHighlightVideo = player => {
    if (!player) return null;
    const countryVideos = HIGHLIGHT_VIDEOS[player.nationality];
    return countryVideos ? countryVideos[player.sex] : null;
  };

  /* ------------------------------ Derived Stats ------------------------------ */

  const currentStats = stats?.[mode] || { ...DEFAULT_STATS };

  const winPercentage =
    currentStats.gamesPlayed > 0
      ? Math.round(
          (currentStats.gamesWon / currentStats.gamesPlayed) * 100
        )
      : 0;

  const avgGuesses =
    currentStats.gamesWon > 0
      ? (
          currentStats.totalGuessesInWins /
          currentStats.gamesWon
        ).toFixed(2)
      : "-";

  const highlightVideoId =
    gameWon && winningPlayer
      ? getHighlightVideo(winningPlayer)
      : null;

  /* -------------------------------------------------------------------------- */
  /*                                   JSX                                      */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="app-bg">
      <div className="app-container">

        {/* Title */}
        <div className="section-card title-section">
          <h1>Volleydle</h1>
          <p>Guess the volleyball player of the day!</p>
        </div>

        {/* -------------------- Mode toggle + Info/Help buttons -------------------- */}
        <div className="section-card mode-toggle-card" style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" }}>
          
          {/* Info Button */}
          <button className="info-help-button" onClick={() => setShowInfo(true)}>i</button>
          
          {/* Mode toggle */}
          <div className="mode-toggle">
            <button onClick={() => setMode("men")} disabled={mode === "men"}>Men's</button>
            <button onClick={() => setMode("women")} disabled={mode === "women"}>Women's</button>
          </div>

          {/* Help Button */}
          <button className="info-help-button" onClick={() => setShowHelp(true)}>?</button>
        </div>

        {/* -------------------- Info Modal -------------------- */}
        {showInfo && (
          <div className="modal-overlay" onClick={() => setShowInfo(false)}>
            <div className="info-help-modal" onClick={(e) => e.stopPropagation()}>
              <h2>Info</h2>
              <p>Every day, try to guess the volleyball player of the day!</p>
              <p>The game is based on player information the 2024 Olympics.</p>
              <p>Contact: volleydlegame@gmail.com</p>
              <p className="countdown">Next player in: {timeLeft} (UTC)</p>
              <button className="close-modal" onClick={() => setShowInfo(false)}>Close</button>
            </div>
          </div>
        )}

        {/* -------------------- Help Modal -------------------- */}
        {showHelp && (
          <div className="modal-overlay" onClick={() => setShowHelp(false)}>
            <div className="info-help-modal" onClick={(e) => e.stopPropagation()}>
              <h2>How to Play</h2>
              <p>Enter a player’s name to uncover their attributes.</p>
              <p>The tile colors show how close your guess is to the correct player:</p>
              <ul>
                <li><strong>Green:</strong> Exact match</li>
                <li><strong>Yellow:</strong> Close Guess (for numbers)</li>
                <li><strong>Orange:</strong> Far Guess (for numbers)</li>
                <li><strong>Red:</strong> No match</li>
                <li>Arrows indicate if the correct answer is above or below your guess, and the amount corresponds to if it is far or near</li>
              </ul>
              <p className="countdown">Next player in: {timeLeft} (UTC)</p>
              <button className="close-modal" onClick={() => setShowHelp(false)}>Close</button>
            </div>
          </div>
        )}

        {/* Search & Guess */}
        <div className="section-card search-section">
          <input type="text" value={guess} onChange={handleInputChange} placeholder="Search player or country..." />
          {filteredPlayers.length > 0 && (
            <ul className="autocomplete">
              {filteredPlayers.map(p => (
                <li key={p.id} onClick={() => { setGuess(p.name); setFilteredPlayers([]); }}>
                  <img src={p.picture_url || DEFAULT_PLAYER_IMAGE} alt={p.name} />
                  <div>
                    <strong>{p.name}</strong>
                    <span>{p.nationality}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button className="guess-button" onClick={handleGuess} disabled={gameWon || !guess}>Guess</button>
          {error && <p className="error">{error}</p>}
        </div>

        {/* Guess Table */}
        <div className="section-card table-section">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Player</th><th>Nationality</th><th>Position</th><th>Age</th>
                  <th>Height</th><th>Jersey</th><th>Continent</th><th>Sex</th>
                </tr>
              </thead>
              <tbody>
                {currentGuesses.map((g, i) => {
                  const isLatest = i === currentGuesses.length - 1;

                  return (
                    <tr key={i} className={isLatest ? "reveal-row" : ""}>
                      <td className={`player-cell reveal-tile ${!isLatest ? "revealed" : ""}`} style={{ "--d": 0 }}>
                        <img src={g.guess.picture_url || DEFAULT_PLAYER_IMAGE} alt={g.guess.name} />
                        {g.guess.name}
                      </td>

                      <td className={`reveal-tile ${g.feedback.nationality ? "good" : "bad"} ${!isLatest ? "revealed" : ""}`} style={{ "--d": 1 }}>
                        {g.guess.nationality}
                      </td>

                      <td className={`reveal-tile ${g.feedback.position ? "good" : "bad"} ${!isLatest ? "revealed" : ""}`} style={{ "--d": 2 }}>
                        {g.guess.position}
                      </td>

                      <td className={`reveal-tile ${getArrowClass(g.feedback.age)} ${!isLatest ? "revealed" : ""}`} style={{ "--d": 3 }}>
                        {g.guess.age} {renderArrow(g.feedback.age)}
                      </td>

                      <td className={`reveal-tile ${getArrowClass(g.feedback.height)} ${!isLatest ? "revealed" : ""}`} style={{ "--d": 4 }}>
                        {g.guess.height_cm} cm {renderArrow(g.feedback.height)}
                      </td>

                      <td className={`reveal-tile ${getArrowClass(g.feedback.jersey_number)} ${!isLatest ? "revealed" : ""}`} style={{ "--d": 5 }}>
                        #{g.guess.jersey_number} {renderArrow(g.feedback.jersey_number)}
                      </td>

                      <td className={`reveal-tile ${g.feedback.continent ? "good" : "bad"} ${!isLatest ? "revealed" : ""}`} style={{ "--d": 6 }}>
                        {g.guess.continent}
                      </td>

                      <td className={`reveal-tile ${g.feedback.sex ? "good" : "bad"} ${!isLatest ? "revealed" : ""}`} style={{ "--d": 7 }}>
                        {g.guess.sex}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Win Card */}
        {gameWon && winningPlayer && (
          <div className="win-card">
            <img src={winningPlayer.picture_url || DEFAULT_PLAYER_IMAGE} alt={winningPlayer.name} />
            <div className="win-info">
              <h2>Today's player:</h2>
              <h3>{winningPlayer.flag} {winningPlayer.name}</h3>
              <p>{winningPlayer.nationality} • {winningPlayer.position}</p>

              {/* Stats button */}
              <button onClick={() => setShowStats(true)}>Stats</button>

              {/* Explore team text */}
              {winningPlayer.team_name && (
                <p className="explore-team">Explore team {winningPlayer.team_name}</p>
              )}

              {/* Video embed */}
              {highlightVideoId && (
                <iframe 
                  src={`https://www.youtube.com/embed/${highlightVideoId}`} 
                  title="Highlights" 
                  allowFullScreen 
                />
              )}

              <p className="countdown">Next player in {timeLeft} (UTC)</p>
            </div>
          </div>
        )}

        {/* Stats Modal */}
        {showStats && (
          <div className="modal-overlay" onClick={() => setShowStats(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Your Stats ({mode === "men" ? "Men" : "Women"})</h2>
              <p>Games Played: {currentStats.gamesPlayed}</p>
              <p>Games Won: {currentStats.gamesWon}</p>
              <p>Win %: {winPercentage}%</p>
              <p>Avg Guesses: {avgGuesses}</p>
              <p>One-Shots: {currentStats.oneShots}</p>
              <p>Current Streak: {currentStats.currentStreak}</p>
              <p>Max Streak: {currentStats.maxStreak}</p>
              <button onClick={() => setShowStats(false)}>Close</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );

}

export default App;
