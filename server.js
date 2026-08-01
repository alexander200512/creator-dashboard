const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Configurazione della connessione al database Postgres di Railway
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pagina principale della dashboard sul server
app.get('/', async (req, res) => {
  try {
    // Creiamo una tabella di prova se non esiste
    await pool.query(`
      CREATE TABLE IF NOT EXISTS metrics (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(50),
        views INT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    res.send(`
      <!DOCTYPE html>
      <html lang="it">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Creator Dashboard Reale</title>
          <style>
              body { background: #0f172a; color: #f8fafc; font-family: sans-serif; padding: 20px; text-align: center; }
              .card { background: #1e293b; border: 1px solid #334155; padding: 20px; border-radius: 12px; margin-top: 20px; }
          </style>
      </head>
      <body>
          <h1>Creator Dashboard Online!</h1>
          <div class="card">
              <p>Il server è attivo e connesso al database PostgreSQL su Railway.</p>
          </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send("Errore di connessione al database: " + err.message);
  }
});

app.listen(port, () => {
  console.log(`Server avviato sulla porta ${port}`);
});
