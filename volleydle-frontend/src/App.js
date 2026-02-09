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
  const API_URL = process.env.REACT_APP_API_URL || ""; // fallback empty so URL building won't blow up

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

  const [loadingPlayers, setLoadingPlayers] = useState(true); 
  const [isSubmitting, setIsSubmitting] = useState(false); // prevents spam guesses
  const [inputFocused, setInputFocused] = useState(false);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const playerRef = React.useRef(null);
  const iframeIdRef = React.useRef(null);
  
  // crash handler modal
  const [crashInfo, setCrashInfo] = useState(null);

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

    try {
      const parsed = JSON.parse(saved);
      if (parsed.date !== today) {
        return { date: today, men: [], women: [] };
      }
      return parsed;
    } catch (e) {
      return { date: today, men: [], women: [] };
    }
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

        // Increment gamesPlayed if there were any guesses yesterday
        setStats(prevStats => ({
          men: {
            ...prevStats.men,
            gamesPlayed:
              prevStats.men.gamesPlayed +
              (yesterdayMen.length > 0 ? 1 : 0),
            currentStreak: didWinMen ? prevStats.men.currentStreak + 1 : 0,
            maxStreak: didWinMen
              ? Math.max(prevStats.men.maxStreak, prevStats.men.currentStreak + 1)
              : prevStats.men.maxStreak,
            totalGuessesInWins:
              prevStats.men.totalGuessesInWins +
              (didWinMen ? yesterdayMen.length : 0),
            oneShots:
              prevStats.men.oneShots +
              (didWinMen && yesterdayMen.length === 1 ? 1 : 0),
            lastPlayedDate: today
          },
          women: {
            ...prevStats.women,
            gamesPlayed:
              prevStats.women.gamesPlayed +
              (yesterdayWomen.length > 0 ? 1 : 0),
            currentStreak: didWinWomen ? prevStats.women.currentStreak + 1 : 0,
            maxStreak: didWinWomen
              ? Math.max(prevStats.women.maxStreak, prevStats.women.currentStreak + 1)
              : prevStats.women.maxStreak,
            totalGuessesInWins:
              prevStats.women.totalGuessesInWins +
              (didWinWomen ? yesterdayWomen.length : 0),
            oneShots:
              prevStats.women.oneShots +
              (didWinWomen && yesterdayWomen.length === 1 ? 1 : 0),
            lastPlayedDate: today
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
    try {
      localStorage.setItem(
        "volleydleGuesses",
        JSON.stringify(guessesByMode)
      );
    } catch (e) {
      console.error("Failed to persist guesses", e);
    }
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
  // improved with loading state & robust error handling

  const fetchPlayersForMode = async (signal) => {
    setLoadingPlayers(true);
    setError(null);

    if (!API_URL) {
      setError("API_URL is not configured.");
      setLoadingPlayers(false);
      setAllPlayers([]);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/players?mode=${mode}`, { signal });

      // handle non-2xx or non-json gracefully
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Players fetch failed: ${res.status} ${res.statusText} ${text}`);
      }

      const data = await res.json().catch(() => {
        throw new Error("Players endpoint did not return valid JSON");
      });

      if (!Array.isArray(data)) {
        throw new Error("Players response is not an array");
      }

      const guessedIds = new Set(
        (guessesByMode[mode] || []).map(g => g.guess.id)
      );

      const remaining = data.filter(p => !guessedIds.has(p.id));
      setAllPlayers(remaining);
    } catch (err) {
      if (err.name === "AbortError") {
        // request was aborted - normal during rapid mode changes
        console.info("players fetch aborted");
      } else {
        console.error("fetchPlayersForMode error", err);
        setError("Failed to load players. Try refreshing the page.");
        setAllPlayers([]);
      }
    } finally {
      setLoadingPlayers(false);
    }
  };

  useEffect(() => {
    // use AbortController to cancel previous fetch if mode toggles quickly
    const ctrl = new AbortController();
    setGuess("");
    setFilteredPlayers([]);
    setError(null);
    fetchPlayersForMode(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  /* ------------------------------ Guess Handling ----------------------------- */

  const handleGuess = () => {
    if (!guess || gameWon || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    fetch(`${API_URL}/api/guess?name=${encodeURIComponent(guess)}&mode=${mode}`)
      .then(res => {
        if (!res.ok) throw res; // will catch 404, 500, etc
        return res.json();
      })
      .then(data => {
        if (data.error) {
          if (data.error.includes("Player not found")) {
            setError(`Player not found. Try another name.`);
          } else {
            setError(data.error);
          }
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
      .catch(async err => {
        if (err.json) {
          const e = await err.json();
          if (e.error && e.error.includes("Player not found")) {
            setError(`Player not found. Try another name.`);
            return;
          }
        }
        setError("Network error or server unavailable");
      })
      .finally(() => setIsSubmitting(false));
  };

  /* ----------------------------- Autocomplete ----------------------------- */

  const normalizeText = (str = "") =>
    str
      .toString()
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

  /* --------------------------- Global crash handlers ------------------------- */
  useEffect(() => {
    function onErrorHandler(msg, url, line, col, error) {
      console.error("Global error caught:", { msg, url, line, col, error });
      setCrashInfo({
        message: msg?.toString() || "An error occurred",
        url,
        line,
        col,
        stack: error?.stack || null
      });
      return false; // allow default handling too
    }

    function onUnhandledRejection(e) {
      console.error("Unhandled Rejection", e);
      const reason = e?.reason || e;
      setCrashInfo({
        message: reason?.message || String(reason),
        stack: reason?.stack || null
      });
    }

    window.addEventListener("error", onErrorHandler);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onErrorHandler);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

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
        <div
          className="section-card mode-toggle-card"
          style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" }}
        >
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
              <p>
                The game is based on player information from the 2024 Olympics.
                Player images and info are gathered from the
                <a
                  href="https://www.volleyballworld.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    marginLeft: '4px',
                    color: '#94bceb',
                    textDecoration: 'none',
                  }}
                >
                  Volleyball World
                </a>
                {' '}website.
              </p>
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
                <li>Arrows indicate if the correct answer is above or below your guess; double arrows = farther away</li>
              </ul>
              <p className="countdown">Next player in: {timeLeft} (UTC)</p>
              <button className="close-modal" onClick={() => setShowHelp(false)}>Close</button>
            </div>
          </div>
        )}

        {/* Search & Guess */}
        <div className="section-card search-section">
          <input
            type="text"
            value={guess}
            onChange={handleInputChange}
            placeholder="Search player or country..."
            aria-label="Search player"
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />

          {(inputFocused && loadingPlayers) && (
            <div style={{ marginTop: 8, color: "#9bb7d6", fontStyle: "italic" }}>
              Loading players…
            </div>
          )}

          {filteredPlayers.length > 0 && (
            <ul className="autocomplete" role="listbox">
              {filteredPlayers.map(p => (
                <li
                  key={p.id}
                  onClick={() => { setGuess(p.name); setFilteredPlayers([]); }}
                  role="option"
                  aria-selected={guess === p.name}
                >
                  <img src={p.picture_url || DEFAULT_PLAYER_IMAGE} alt={p.name} />
                  <div>
                    <strong>{p.name}</strong>
                    <span>{p.nationality}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <button
            className="guess-button"
            onClick={handleGuess}
            disabled={gameWon || !guess || isSubmitting}
            aria-disabled={gameWon || !guess || isSubmitting}
          >
            {isSubmitting ? "Checking…" : "Guess"}
          </button>

          {error && (
            <p
              style={{
                marginTop: 8,
                color: "#658abe"
              }}
            >
              {error}
            </p>
          )}
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
              <p>{winningPlayer.nationality} • {winningPlayer.position} • #{winningPlayer.jersey_number}</p>

              {/* Stats button */}
              <button onClick={() => setShowStats(true)}>Stats</button>

              {/* Explore team text */}
              {winningPlayer.team_name && (
                <p className="explore-team">Explore team {winningPlayer.team_name}</p>
              )}

              {/* Video embed with preloaded hidden iframe */}
              {highlightVideoId && (
                <div
                  className="video-container"
                  style={{
                    width: "100%",
                    height: 260,
                    borderRadius: 8,
                    marginTop: 12,
                    position: "relative",
                    overflow: "hidden",
                    backgroundColor: "#000",
                  }}
                >
                  {/* Always-rendered iframe with enablejsapi and origin */}
                  <iframe
                    id={iframeIdRef.current || `yt-player-${highlightVideoId}`}
                    src={`https://www.youtube.com/embed/${highlightVideoId}?enablejsapi=1&rel=0&origin=${encodeURIComponent(window.location.origin)}`}
                    title="Highlights"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      border: 0,
                      zIndex: 1,
                    }}
                  />

                  {/* Thumbnail overlay - stays on top until we start playback */}
                  {!isVideoPlaying && (
                    <div
                      className="video-thumbnail-overlay"
                      onClick={async () => {
                        try {
                          // ensure player exists then start playback
                          if (playerRef.current && typeof playerRef.current.playVideo === "function") {
                            playerRef.current.playVideo();
                            setIsVideoPlaying(true);
                          } else {
                            // In case player not yet ready, try to init then play once ready
                            // player will be created by the useEffect below
                            setIsVideoPlaying(true);
                          }
                        } catch (e) {
                          console.error("Play attempt failed", e);
                          // fallback: set isVideoPlaying true so iframe is visible and user can press play in the player
                          setIsVideoPlaying(true);
                        }
                      }}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundImage: `url(https://img.youtube.com/vi/${highlightVideoId}/hqdefault.jpg)`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        cursor: "pointer",
                        zIndex: 2,
                      }}
                    />
                  )}
                </div>
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

        {/* Crash Modal */}
        {crashInfo && (
          <div className="modal-overlay" onClick={() => setCrashInfo(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Something went wrong</h2>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{crashInfo.message}</p>
              {crashInfo.stack && (
                <details style={{ textAlign: "left", marginTop: 8 }}>
                  <summary>Stack trace</summary>
                  <pre style={{ fontSize: 11 }}>{crashInfo.stack}</pre>
                </details>
              )}
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
                <button onClick={() => window.location.reload()}>Reload</button>
                <button onClick={() => setCrashInfo(null)}>Dismiss</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
