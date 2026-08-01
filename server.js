const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());

// Inizializzazione Database
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kpi_metrics (
        id SERIAL PRIMARY KEY,
        title VARCHAR(100),
        value VARCHAR(50),
        change_percentage VARCHAR(20),
        category VARCHAR(50)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        type VARCHAR(50),
        status VARCHAR(50),
        seo_tags VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS social_integrations (
        id SERIAL PRIMARY KEY,
        platform VARCHAR(50) UNIQUE,
        account_id VARCHAR(100),
        api_key VARCHAR(255),
        is_connected BOOLEAN DEFAULT false,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Popolamento KPI iniziali su "--"
    const resKpi = await pool.query('SELECT COUNT(*) FROM kpi_metrics');
    if (parseInt(resKpi.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO kpi_metrics (title, value, change_percentage, category) VALUES 
        ('Visualizzazioni Totali', '--', '--', 'traffic'),
        ('Nuovi Iscritti', '--', '--', 'audience'),
        ('Entrate Stimate', '--', '--', 'monetization'),
        ('Engagement Rate', '--', '--', 'engagement')
      `);
    } else {
      await pool.query(`
        UPDATE kpi_metrics 
        SET value = '--', change_percentage = '--' 
        WHERE value IN ('142.5K', '1,280', '€ 845,00', '6.8%')
      `);
    }

    const resSocial = await pool.query('SELECT COUNT(*) FROM social_integrations');
    if (parseInt(resSocial.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO social_integrations (platform, account_id, api_key, is_connected) VALUES 
        ('YouTube', '', '', false),
        ('Twitch', '', '', false),
        ('Instagram', '', '', false),
        ('TikTok', '', '', false)
        ON CONFLICT (platform) DO NOTHING
      `);
    }
  } catch (err) {
    console.error("Errore inizializzazione database:", err);
  }
}
initDb();

// ==========================================
// API REST
// ==========================================
app.get('/api/overview', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kpi_metrics ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore API Overview" });
  }
});

app.get('/api/contents', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contents ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore API Contents" });
  }
});

app.post('/api/contents', async (req, res) => {
  const { title, type, status, seo_tags } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO contents (title, type, status, seo_tags) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, type, status, seo_tags]
    );
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Errore salvataggio contenuto" });
  }
});

app.get('/api/settings/socials', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM social_integrations ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Errore API Settings" });
  }
});

app.post('/api/settings/socials', async (req, res) => {
  const { platform, account_id, api_key } = req.body;
  const is_connected = Boolean(account_id && account_id.trim() !== "");
  try {
    const result = await pool.query(
      `UPDATE social_integrations 
       SET account_id = $1, api_key = $2, is_connected = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE platform = $4 RETURNING *`,
      [account_id, api_key, is_connected, platform]
    );
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Errore salvataggio API Social" });
  }
});
// ==========================================
// FRONTEND INTEGRATO CON SIDEBAR LATERALE
// ==========================================
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Creator Dashboard</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
              background: #0f172a; 
              color: #f8fafc; 
              padding-bottom: 70px;
              overflow-x: hidden;
            }
            
            /* Header principale con Hamburger */
            .header {
              background: #1e293b;
              padding: 16px 20px;
              border-bottom: 1px solid #334155;
              display: flex;
              align-items: center;
              gap: 16px;
              position: sticky;
              top: 0;
              z-index: 100;
            }
            .hamburger {
              background: transparent;
              border: none;
              color: #f8fafc;
              font-size: 24px;
              cursor: pointer;
              display: flex;
              align-items: center;
            }
            .header h1 { font-size: 18px; color: #38bdf8; flex-grow: 1; }
            .header-badge { font-size: 13px; color: #94a3b8; }
            
            /* Sfondo oscurato quando si apre il menu */
            .sidebar-overlay {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(0, 0, 0, 0.6);
              backdrop-filter: blur(2px);
              z-index: 900;
              opacity: 0;
              visibility: hidden;
              transition: opacity 0.3s ease;
            }
            .sidebar-overlay.active {
              opacity: 1;
              visibility: visible;
            }

            /* Menu Laterale a Scomparsa (Sinistra) */
            .sidebar {
              position: fixed;
              top: 0;
              left: -280px;
              width: 260px;
              height: 100vh;
              background: #1e293b;
              border-right: 1px solid #334155;
              z-index: 1000;
              padding: 20px 16px;
              display: flex;
              flex-direction: column;
              gap: 8px;
              transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 4px 0 24px rgba(0,0,0,0.5);
            }
            .sidebar.open {
              left: 0;
            }
            .sidebar-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding-bottom: 16px;
              margin-bottom: 12px;
              border-bottom: 1px solid #334155;
            }
            .sidebar-title {
              font-weight: bold;
              font-size: 16px;
              color: #38bdf8;
            }
            .close-btn {
              background: transparent;
              border: none;
              color: #94a3b8;
              font-size: 20px;
              cursor: pointer;
            }
            
            /* Pulsanti del menu laterale */
            .tab-btn {
              background: transparent;
              color: #cbd5e1;
              border: none;
              padding: 14px 16px;
              border-radius: 10px;
              font-size: 15px;
              font-weight: 600;
              text-align: left;
              cursor: pointer;
              transition: all 0.2s;
              display: flex;
              align-items: center;
              gap: 12px;
            }
            .tab-btn:hover { background: #334155; }
            .tab-btn.active { 
              background: #0284c7; 
              color: #fff; 
              box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3);
            }
            
            /* Contenitore Principale e Schede */
            .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
            .tab-pane { display: none; }
            .tab-pane.active { display: block; }

            /* Modulo 1: Overview */
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
            .neutral { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
            
            .section-title { font-size: 18px; margin: 20px 0 12px 0; color: #e2e8f0; }
            .placeholder-box {
              background: #1e293b;
              border: 2px dashed #334155;
              border-radius: 12px;
              padding: 40px 20px;
              text-align: center;
              color: #64748b;
            }

            /* Moduli 2 & 6: Form e Card */
            .form-card {
              background: #1e293b;
              padding: 20px;
              border-radius: 12px;
              border: 1px solid #334155;
              margin-bottom: 16px;
            }
            .form-group { display: flex; flex-direction: column; gap: 12px; }
            input, select {
              width: 100%;
              padding: 12px;
              border-radius: 8px;
              border: 1px solid #475569;
              background: #0f172a;
              color: #fff;
              font-size: 14px;
            }
            button.action-btn {
              background: #38bdf8;
              color: #0f172a;
              border: none;
              padding: 12px;
              border-radius: 8px;
              font-weight: bold;
              font-size: 15px;
              cursor: pointer;
            }
            button.action-btn:hover { background: #0ea5e9; }

            /* Modulo 2: Lista Contenuti */
            .content-list { display: flex; flex-direction: column; gap: 12px; }
            .content-item {
              background: #1e293b;
              padding: 16px;
              border-radius: 10px;
              border: 1px solid #334155;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .content-header { display: flex; justify-content: space-between; align-items: flex-start; }
            .content-title { font-weight: bold; font-size: 16px; color: #fff; }
            .badge { font-size: 12px; padding: 4px 8px; border-radius: 6px; font-weight: 600; text-transform: uppercase; }
            .badge.pubblicato { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
            .badge.programmato { background: rgba(234, 179, 8, 0.2); color: #facc15; }
            .badge.bozza { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
            .content-seo { font-size: 13px; color: #94a3b8; }

            /* Modulo 6: Status API */
            .social-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
            }
            .status-badge {
              font-size: 12px;
              padding: 4px 10px;
              border-radius: 20px;
              font-weight: bold;
            }
            .status-connected { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }
            .status-disconnected { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }

            @media (max-width: 600px) {
              .kpi-grid { grid-template-columns: 1fr; }
            }
        </style>
    </head>
    <body>
            <!-- Header Fisso con Pulsante Hamburger -->
        <div class="header">
            <button class="hamburger" onclick="toggleSidebar()" aria-label="Apri Menu">☰</button>
            <h1>🚀 Creator Dashboard</h1>
            <span class="header-badge">Benvenuto!</span>
        </div>

        <!-- Overlay Sfondo (per chiudere il menu toccando fuori) -->
        <div class="sidebar-overlay" id="overlay" onclick="toggleSidebar()"></div>

        <!-- Sidebar Laterale a Scomparsa -->
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <span class="sidebar-title">Menu Moduli</span>
                <button class="close-btn" onclick="toggleSidebar()">✕</button>
            </div>
            
            <button class="tab-btn active" onclick="switchTab('overview', this)">📊 1. Overview</button>
            <button class="tab-btn" onclick="switchTab('contents', this)">📝 2. Contenuti</button>
            <button class="tab-btn" onclick="alert('Modulo 3: Analytics in arrivo!')">📈 3. Analytics</button>
            <button class="tab-btn" onclick="alert('Modulo 4: Monetizzazione in arrivo!')">💰 4. Revenue</button>
            <button class="tab-btn" onclick="alert('Modulo 5: Community in arrivo!')">💬 5. Community</button>
            <button class="tab-btn" onclick="switchTab('settings', this)">⚙️ 6. Settings (API)</button>
        </div>

        <div class="container">
            <!-- TAB 1: OVERVIEW -->
            <div id="tab-overview" class="tab-pane active">
                <h2 class="section-title" style="margin-top:0;">KPI Principali (Tempo Reale)</h2>
                <div id="kpi-container" class="kpi-grid">
                    <div>Caricamento metriche in corso...</div>
                </div>

                <h2 class="section-title">Andamento Periodo Precedente</h2>
                <div class="placeholder-box">
                    💡 Collega i tuoi account nella sezione <strong>Settings (API)</strong> per importare le metriche reali!
                </div>
            </div>

            <!-- TAB 2: CONTENUTI -->
            <div id="tab-contents" class="tab-pane">
                <div class="form-card">
                    <h2 class="section-title" style="margin-top:0;">⚡ Editor Rapido / Nuovo Contenuto</h2>
                    <div class="form-group">
                        <input type="text" id="cTitle" placeholder="Titolo del contenuto">
                        <select id="cType">
                            <option value="Video">Video YouTube</option>
                            <option value="Post">Post Social</option>
                            <option value="Live">Streaming Live</option>
                        </select>
                        <select id="cStatus">
                            <option value="Pubblicato">Pubblicato</option>
                            <option value="Programmato">Programmato</option>
                            <option value="Bozza">Bozza</option>
                        </select>
                        <input type="text" id="cTags" placeholder="Tag SEO (es. gaming, tutorial)">
                        <button class="action-btn" onclick="addContent()">+ Aggiungi al Content Hub</button>
                    </div>
                </div>

                <h2 class="section-title">I Miei Contenuti</h2>
                <div id="contents-list" class="content-list">
                    <div>Caricamento contenuti dal database...</div>
                </div>
            </div>

            <!-- TAB 6: IMPOSTAZIONI & API SOCIAL -->
            <div id="tab-settings" class="tab-pane">
                <h2 class="section-title" style="margin-top:0;">🔗 Collegamento API Profili Social</h2>
                <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;">
                    Inserisci l'ID del tuo canale o account e la chiave API (o OAuth Access Token) per abilitare la sincronizzazione delle metriche e dei KPI.
                </p>
                <div id="social-integrations-list">
                    <div>Caricamento impostazioni social...</div>
                </div>
            </div>
        </div>

        <script>
            // Apertura/Chiusura Sidebar
            function toggleSidebar() {
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('overlay');
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            }

            // Cambio Scheda + Chiusura automatica del menu su mobile
            function switchTab(tabName, btnElement) {
                document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
                
                document.getElementById('tab-' + tabName).classList.add('active');
                btnElement.classList.add('active');
                
                const sidebar = document.getElementById('sidebar');
                if (sidebar.classList.contains('open')) {
                    toggleSidebar();
                }

                if (tabName === 'overview') loadOverview();
                if (tabName === 'contents') loadContents();
                if (tabName === 'settings') loadSettings();
            }

            // --- OVERVIEW ---
            async function loadOverview() {
                try {
                    const response = await fetch('/api/overview');
                    const data = await response.json();
                    const container = document.getElementById('kpi-container');
                    container.innerHTML = '';
                    
                    data.forEach(item => {
                        let badgeClass = 'neutral';
                        if (item.change_percentage !== '--') {
                            badgeClass = !item.change_percentage.includes('-') ? 'pos' : 'neg';
                        }
                        
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

            // --- CONTENUTI ---
            async function loadContents() {
                try {
                    const response = await fetch('/api/contents');
                    const data = await response.json();
                    const container = document.getElementById('contents-list');
                    container.innerHTML = '';
                    
                    if (data.length === 0) {
                        container.innerHTML = '<div class="placeholder-box">Nessun contenuto inserito. Aggiungine uno sopra!</div>';
                        return;
                    }

                    data.forEach(item => {
                        const statusClass = item.status.toLowerCase();
                        container.innerHTML += 
                          '<div class="content-item">' +
                              '<div class="content-header">' +
                                  '<span class="content-title">' + item.title + '</span>' +
                                  '<span class="badge ' + statusClass + '">' + item.status + '</span>' +
                              '</div>' +
                              '<div style="font-size: 13px; color: #38bdf8;">Tipologia: ' + item.type + '</div>' +
                              '<div class="content-seo">🏷️ Tag: ' + (item.seo_tags || 'Nessuno') + '</div>' +
                          '</div>';
                    });
                } catch (err) {
                    document.getElementById('contents-list').innerText = 'Errore nel caricamento dei contenuti.';
                }
            }

            async function addContent() {
                const title = document.getElementById('cTitle').value;
                const type = document.getElementById('cType').value;
                const status = document.getElementById('cStatus').value;
                const seo_tags = document.getElementById('cTags').value;

                if (!title.trim()) {
                    alert('Inserisci un titolo valido');
                    return;
                }

                try {
                    const response = await fetch('/api/contents', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, type, status, seo_tags })
                    });
                    const resData = await response.json();
                    if (resData.success) {
                        document.getElementById('cTitle').value = '';
                        document.getElementById('cTags').value = '';
                        loadContents();
                    } else {
                        alert('Errore durante il salvataggio');
                    }
                } catch (err) {
                    alert('Errore di connessione al server');
                }
            }

            // --- SETTINGS (API SOCIAL) ---
            async function loadSettings() {
                try {
                    const response = await fetch('/api/settings/socials');
                    const data = await response.json();
                    const container = document.getElementById('social-integrations-list');
                    container.innerHTML = '';

                    data.forEach(item => {
                        const isConn = item.is_connected;
                        const statusText = isConn ? 'Connesso' : 'Disconnesso';
                        const statusClass = isConn ? 'status-connected' : 'status-disconnected';

                        container.innerHTML += 
                          '<div class="form-card">' +
                              '<div class="social-header">' +
                                  '<strong>' + item.platform + '</strong>' +
                                  '<span class="status-badge ' + statusClass + '">' + statusText + '</span>' +
                              '</div>' +
                              '<div class="form-group">' +
                                  '<input type="text" id="acc-' + item.platform + '" placeholder="Account ID / Username" value="' + (item.account_id || '') + '">' +
                                  '<input type="password" id="key-' + item.platform + '" placeholder="API Key / Access Token" value="' + (item.api_key || '') + '">' +
                                  '<button class="action-btn" onclick="saveSocial(\'' + item.platform + '\')">Salva e Aggiorna ' + item.platform + '</button>' +
                              '</div>' +
                          '</div>';
                    });
                } catch (err) {
                    document.getElementById('social-integrations-list').innerText = 'Errore caricamento impostazioni.';
                }
            }

            async function saveSocial(platform) {
                const account_id = document.getElementById('acc-' + platform).value;
                const api_key = document.getElementById('key-' + platform).value;

                try {
                    const response = await fetch('/api/settings/socials', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ platform, account_id, api_key })
                    });
                    const resData = await response.json();
                    if (resData.success) {
                        alert('Impostazioni salvate per ' + platform + '!');
                        loadSettings();
                    } else {
                        alert('Errore nel salvataggio.');
                    }
                } catch (err) {
                    alert('Errore di connessione.');
                }
            }

            // Caricamento iniziale dei KPI all'avvio della pagina
            loadOverview();
        </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Server in ascolto sulla porta ${port}`);
});

