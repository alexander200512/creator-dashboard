const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Connessione al database PostgreSQL di Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware per leggere il formato JSON nelle richieste API
app.use(express.json());

// Tabella di esempio per testare le API (creata in automatico all'avvio)
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        value INT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Inserisce un dato di prova se la tabella è vuota
    const res = await pool.query('SELECT COUNT(*) FROM stats');
    if (parseInt(res.rows[0].count) === 0) {
      await pool.query("INSERT INTO stats (name, value) VALUES ('Visualizzazioni', 1250), ('Iscritti', 340)");
    }
  } catch (err) {
    console.error("Errore inizializzazione database:", err);
  }
}
initDb();

// --- API ROUTES ---

// 1. Ottieni tutti i dati dal database
api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM stats ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore nel recupero dati" });
  }
});

// 2. Aggiungi o aggiorna un dato tramite API
app.post('/api/stats', async (req, res) => {
  const { name, value } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO stats (name, value) VALUES ($1, $2) RETURNING *',
      [name, value]
    );
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore durante il salvataggio" });
  }
});

// --- FRONTEND HTML (La tua interfaccia) ---
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Creator Dashboard</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
            .container { width: 100%; max-width: 600px; background: #1e293b; padding: 24px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            h1 { font-size: 24px; margin-bottom: 20px; color: #38bdf8; text-align: center; }
            .card { background: #334155; padding: 15px; margin-bottom: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
            .form-group { display: flex; gap: 10px; margin-top: 20px; }
            input { flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; }
            button { background: #38bdf8; color: #0f172a; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; }
            button:hover { background: #0ea5e9; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Creator Dashboard</h1>
            <div id="stats-list">Caricamento dati dal database...</div>
            
            <div class="form-group">
                <input type="text" id="statName" placeholder="Nome metrica (es. Like)">
                <input type="number" id="statValue" placeholder="Valore">
                <button onclick="addStat()">Aggiungi</button>
            </div>
        </div>

        <script>
            async function loadStats() {
                try {
                    const response = await fetch('/api/stats');
                    const data = await response.json();
                    const listContainer = document.getElementById('stats-list');
                    listContainer.innerHTML = '';
                    data.forEach(stat => {
                        listContainer.innerHTML += \`
                            <div class="card">
                                <span>\${stat.name}</span>
                                <strong>\${stat.value}</strong>
                            </div>
                        \`;
                    });
                } catch (err) {
                    document.getElementById('stats-list').innerText = 'Errore di connessione alle API.';
                }
            }

            async function addStat() {
                const name = document.getElementById('statName').value;
                const value = document.getElementById('statValue').value;
                if (!name || !value) return alert('Compila tutti i campi!');

                await fetch('/api/stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, value: parseInt(value) })
                });

                document.getElementById('statName').value = '';
                document.getElementById('statValue').value = '';
                loadStats();
            }

            loadStats();
        </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(\`Server in ascolto sulla porta \${port}\`);
});
