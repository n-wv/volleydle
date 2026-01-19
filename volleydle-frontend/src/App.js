import React, { useEffect, useState } from "react";

function App() {
  const [guess, setGuess] = useState("");
  const [guesses, setGuesses] = useState([]);
  const [error, setError] = useState(null);

  // For fetching players
  const [allPlayers, setAllPlayers] = useState([]);
  const [filteredPlayers, setFilteredPlayers] = useState([]);

  useEffect(() => {
  fetch("https://volleydle-fucmazapa4d5dyax.westus-01.azurewebsites.net/api/players")
    .then(res => res.json())
    .then(data => setAllPlayers(data))
    .catch(err => console.error(err));
  }, []);

  // Handle user guess submission
  const handleGuess = () => {
    if (!guess) return;

    fetch(
      `https://volleydle-fucmazapa4d5dyax.westus-01.azurewebsites.net/api/guess?name=${encodeURIComponent(guess)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }

        // Add guess to table
        setGuesses((prev) => [...prev, data]);
        setError(null);

        //remove guessed player from autocomplete pool
        setAllPlayers((prev) =>
          prev.filter((p) => p.id !== data.guess.id)
        );

        // Clear UI
        setFilteredPlayers([]);
        setGuess("");
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

    // Include nationality in search
    const filtered = allPlayers
      .filter(p =>
        p.name.toLowerCase().includes(lower) ||
        p.nationality.toLowerCase().includes(lower) ||
        p.team_name.toLowerCase().includes(lower)
      )
      .slice(0, 30); // Limit to 30 results

    setFilteredPlayers(filtered);
  };

  const renderArrow = (feedback) => {
    if (feedback === "match") return "✓";

    if (feedback === "higher") return "↑";
    if (feedback === "lower") return "↓";

    if (feedback === "higher_far") return "↑↑";
    if (feedback === "lower_far") return "↓↓";

    return "";
  };

  const getArrowColor = (feedback) => {
    if (feedback === "match") return "lightgreen";
    if (feedback.includes("far")) return "#ff8c00"; // dark orange
    return "lightyellow";
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h1>Volleydle 🎮</h1>
      <p>Guess the Olympic volleyball player of the day!</p>

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
            overflowY: "auto"       //enables scrolling
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
      <button onClick={handleGuess}>Guess</button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <table border="1" cellPadding="8" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>Player</th>
            <th>Nationality</th>
            <th>Position</th>
            <th>Age</th>
            <th>Height</th>
            <th>Team</th>
            <th>Jersey</th>
            <th>Continent</th>
            <th>Sex</th>
          </tr>
        </thead>
        <tbody>
          {guesses.map((g, i) => (
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
              <td style={{ backgroundColor: g.feedback.team ? "lightgreen" : "lightcoral" }}>
                {g.guess.team_name}
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
    </div>
  );
}

export default App;