import React, { useEffect, useState } from "react";

function App() {
  const [guess, setGuess] = useState("");
  const [guesses, setGuesses] = useState([]);
  const [error, setError] = useState(null);

  const handleGuess = () => {
    if (!guess) return;
    fetch(`https://volleydle-fucmazapa4d5dyax.westus-01.azurewebsites.net/api/guess?name=${encodeURIComponent(guess)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setGuesses([...guesses, data]);
          setError(null);
        }
        setGuess("");
      });
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", padding: "20px" }}>
      <h1>Volleydle 🎮</h1>
      <p>Guess the Olympic volleyball player of the day!</p>

      <input
        type="text"
        value={guess}
        onChange={(e) => setGuess(e.target.value)}
        placeholder="Enter player name..."
      />
      <button onClick={handleGuess}>Guess</button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <table border="1" cellPadding="8" style={{ marginTop: "20px" }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Nationality</th>
            <th>Position</th>
            <th>Age</th>
            <th>Height</th>
            <th>Team</th>
            <th>Sex</th>
          </tr>
        </thead>
        <tbody>
          {guesses.map((g, i) => (
            <tr key={i}>
              <td>{g.guess.name}</td>
              <td style={{ backgroundColor: g.feedback.nationality ? "lightgreen" : "lightcoral" }}>
                {g.guess.nationality}
              </td>
              <td style={{ backgroundColor: g.feedback.position ? "lightgreen" : "lightcoral" }}>
                {g.guess.position}
              </td>
              <td style={{ backgroundColor: g.feedback.age === "match" ? "lightgreen" : "lightyellow" }}>
                {g.guess.age} ({g.feedback.age})
              </td>
              <td style={{ backgroundColor: g.feedback.height === "match" ? "lightgreen" : "lightyellow" }}>
                {g.guess.height_cm} cm ({g.feedback.height})
              </td>
              <td style={{ backgroundColor: g.feedback.team ? "lightgreen" : "lightcoral" }}>
                {g.guess.team_name}
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