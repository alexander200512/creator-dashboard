const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());

// Inizializzazione Database per il Modulo 1 (Overview & KPI)
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpi_metrics (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100),
        value VARCHAR(50),
        change_percentage VARCHAR(20),
        category VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const res = await pool.query('SELECT COUNT(*) FROM kpi_metrics');
    if (parseInt(res.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO kpi_metrics (title, value, change_percentage, category) VALUES 
        ('Visualizzazioni Totali', '142.5K', '+12.4%', 'traffic'),
        ('Nuovi Iscritti', '1,280', '+8.1%', 'audience'),
        ('Entrate Stimate', '€ 845,00', '+15.3%', 'monetization'),
        ('Engagement Rate', '6.8%', '+0.5%', 'engagement')
      `);
    }
  } catch (err) {
    console.error("Errore inizializzazione database:", err);
  }
}
initDb();

// API per recuperare i KPI del Modulo 1
app.get('/api/overview', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kpi_metrics ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Errore nel recupero dati Overview" });
  }
});

// Frontend Dashboard Integrato
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Creator Dashboard - Overview</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
              background: #0f172a; 
              color: #f8fafc; 
              padding-bottom: 70px; /* Spazio per la navigazione mobile */
            }
            .header {
              background: #1e293b;
              padding: 16px 20px;
              border-bottom: 1px solid #334155;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .header h1 { font-size: 20px; color: #38bdf8; }
            .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
            
            /* Menu di navigazione */
            .nav-tabs {
              display: flex;
              gap: 8px;
              overflow-x: auto;
              padding-bottom: 12px;
              margin-bottom: 20px;
              border-bottom: 1px solid #334155;
              scrollbar-width: none;
            }
            .tab-btn {
              background: #1e293b;
              color: #94a3b8;
              border: none;
              padding: 10px 16px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              white-space: nowrap;
              cursor: pointer;
            }
            .tab-btn.active { background: #0284c7; color: #fff; }
            
            /* Griglia KPI Responsive */
            .kpi-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              gap: 16px;
              margin-bottom: 24px;
            }
            .kpi-card {
              background: #1e293b;
              padding: 20px;
              border-radius: 12px;
              border: 1px solid #334155;
              box-shadow: 0 4px 6px rgba(0,0,0,0.2);
            }
            .kpi-title { font-size: 14px; color: #94a3b8; margin-bottom: 8px; }
            .kpi-value { font-size: 28px; font-weight: bold; color: #f8fafc; margin-bottom: 8px; }
            .kpi-change { font-size: 13px; font-weight: 600; display: inline-block; padding: 4px 8px; border-radius: 6px; }
            .pos { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
            .neg { background: rgba(239, 68, 68, 0.2); color: #f87171; }
            
            .section-title { font-size: 18px; margin: 20px 0 12px 0; color: #e2e8f0; }
            .placeholder-box {
              background: #1e293b;
              border: 2px dashed #334155;
              border-radius: 12px;
              padding: 40px 20px;
              text-align: center;
              color: #64748b;
            }

            @media (max-width: 600px) {
              .kpi-grid { grid-template-columns: 1fr; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🚀 Creator Dashboard</h1>
            <span>Benvenuto!</span>
        </div>

        <div class="container">
            <div class="nav-tabs">
                <button class="tab-btn active">📊 1. Overview</button>
                <button class="tab-btn" onclick="alert('Modulo 2: Content Hub in arrivo nello Step 2!')">📝 2. Contenuti</button>
                <button class="tab-btn" onclick="alert('Modulo 3: Analytics in arrivo!')">📈 3. Analytics</button>
                <button class="tab-btn" onclick="alert('Modulo 4: Monetizzazione in arrivo!')">💰 4. Revenue</button>
                <button class="tab-btn" onclick="alert('Modulo 5: Community in arrivo!')">💬 5. Community</button>
                <button class="tab-btn" onclick="alert('Modulo 6: Impostazioni in arrivo!')">⚙️ 6. Settings</button>
            </div>

            <h2 class="section-title">KPI Principali (Tempo Reale)</h2>
            <div id="kpi-container" class="kpi-grid">
                <div>Caricamento metriche in corso...</div>
            </div>

            <h2 class="section-title">Andamento Periodo Precedente</h2>
            <div class="placeholder-box">
                📈 Qui inseriremo il grafico di crescita (Visualizzazioni e Ricavi) nel prossimo step.
            </div>
        </div>

        <script>
            async function loadOverview() {
                try {
                    const response = await fetch('/api/overview');
                    const data = await response.json();
                    const container = document.getElementById('kpi-container');
                    container.innerHTML = '';
                    
                    data.forEach(item => {
                        const isPositive = !item.change_percentage.includes('-');
                        const badgeClass = isPositive ? 'pos' : 'neg';
                        
                        container.innerHTML += 
                          '<div class="kpi-card">' +
                              '<div class="kpi-title">' + item.title + '</div>' +
                              '<div class="kpi-value">' + item.value + '</div>' +
                              '<div class="kpi-change ' + badgeClass + '">' + item.change_percentage + ' vs mese scorso</div>' +
                          '</div>';
                    });
                } catch (err) {
                    document.getElementById('kpi-container').innerText = 'Errore nel caricamento delle metriche.';
                }
            }

            loadOverview();
        </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server in ascolto sulla porta ${port}`);
});
