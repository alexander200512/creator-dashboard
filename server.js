const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());

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
    
    await pool.query(`
      ALTER TABLE social_integrations 
      ADD COLUMN IF NOT EXISTS is_connected BOOLEAN DEFAULT false;
    `);

    const resKpi = await pool.query('SELECT COUNT(*) FROM kpi_metrics');
    if (parseInt(resKpi.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO kpi_metrics (title, value, change_percentage, category) VALUES 
        ('Total Views', '142.5K', '+12.4% vs last month', 'traffic'),
        ('New Subscribers', '1,280', '+8.1% vs last month', 'audience'),
        ('Estimated Revenue', '€ 845,00', '+15.3% vs last month', 'monetization'),
        ('Engagement Rate', '6.8%', '+0.5% vs last month', 'engagement')
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
    console.error("Database initialization error:", err);
  }
}
initDb();

app.get('/api/overview', async (req, res) => {
  try {
    const socialCheck = await pool.query('SELECT COUNT(*) FROM social_integrations WHERE is_connected = true');
    const isConnected = parseInt(socialCheck.rows[0].count) > 0;
    const result = await pool.query('SELECT * FROM kpi_metrics ORDER BY id ASC');
    
    if (!isConnected) {
      const maskedRows = result.rows.map(row => ({
        ...row,
        value: '--',
        change_percentage: '-- vs last month'
      }));
      return res.json(maskedRows);
    }
    res.json(result.rows);
  } catch (err) {
    console.error("Overview error:", err);
    res.status(500).json({ error: "Overview API Error" });
  }
});

app.get('/api/contents', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contents ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Contents API Error" });
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
    res.status(500).json({ error: "Error saving content" });
  }
});

app.get('/api/settings/socials', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM social_integrations ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Settings API Error" });
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
    res.status(500).json({ error: "Error saving social API settings" });
  }
});
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
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
            .header {
              background: #1e293b;
              padding: 16px 20px;
              border-bottom: 1px solid #334155;
              display: flex;
              align-items: center;
              gap: 16px;
              position: sticky;
              top: 0;
              z-index: 1050;
            }
            .hamburger {
              background: transparent;
              border: none;
              color: #f8fafc;
              font-size: 24px;
              cursor: pointer;
              display: flex;
              align-items: center;
              padding: 4px;
            }
            .header h1 { font-size: 18px; color: #38bdf8; flex-grow: 1; }
            .header-badge { font-size: 13px; color: #94a3b8; }
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
            .sidebar {
              position: fixed;
              top: 0;
              left: -280px;
              width: 260px;
              height: 100vh;
              background: #1e293b;
              border-right: 1px solid #334155;
              z-index: 1100;
              padding: 20px 16px;
              display: flex;
              flex-direction: column;
              gap: 8px;
              transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 4px 0 24px rgba(0,0,0,0.5);
            }
            .sidebar.open { left: 0; }
            .sidebar-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding-bottom: 16px;
              margin-bottom: 12px;
              border-bottom: 1px solid #334155;
            }
            .sidebar-title { font-weight: bold; font-size: 16px; color: #38bdf8; }
            .close-btn { background: transparent; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; padding: 4px; }
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
              width: 100%;
            }
            .tab-btn:hover { background: #334155; }
            .tab-btn.active { background: #0284c7; color: #fff; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.3); }
            .container { max-width: 1000px; margin: 0 auto; padding: 20px; }
            .tab-pane { display: none; }
            .tab-pane.active { display: block; }
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
              width: 100%;
            }
            button.action-btn:hover { background: #0ea5e9; }
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
            .badge.published { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
            .badge.scheduled { background: rgba(234, 179, 8, 0.2); color: #facc15; }
            .badge.draft { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
            .content-seo { font-size: 13px; color: #94a3b8; }
            .social-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
            .status-badge { font-size: 12px; padding: 4px 10px; border-radius: 20px; font-weight: bold; }
            .status-connected { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid #22c55e; }
            .status-disconnected { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
            @media (max-width: 600px) { .kpi-grid { grid-template-columns: 1fr; } }
        </style>
    </head>
    <body>
        <div class="header">
            <button class="hamburger" onclick="toggleSidebar()" aria-label="Open Menu">☰</button>
            <h1>Creator Dashboard</h1>
            <span class="header-badge">Welcome!</span>
        </div>

        <div class="sidebar-overlay" id="overlay" onclick="toggleSidebar()"></div>

        <div class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <span class="sidebar-title">Modules Menu</span>
                <button class="close-btn" onclick="toggleSidebar()">✕</button>
            </div>
            <button class="tab-btn active" onclick="switchTab('overview', this)">📊 1. Overview</button>
            <button class="tab-btn" onclick="switchTab('contents', this)">📝 2. Contents</button>
            <button class="tab-btn" onclick="alert('Module 3: Analytics coming soon!')">📈 3. Analytics</button>
            <button class="tab-btn" onclick="alert('Module 4: Revenue coming soon!')">💰 4. Revenue</button>
            <button class="tab-btn" onclick="alert('Module 5: Community coming soon!')">💬 5. Community</button>
            <button class="tab-btn" onclick="switchTab('settings', this)">⚙️ 6. Settings (API)</button>
        </div>

        <div class="container">
            <div id="tab-overview" class="tab-pane active">
                <h2 class="section-title" style="margin-top:0;">Main KPI (Real-Time)</h2>
                <div id="kpi-container" class="kpi-grid"></div>
                <h2 class="section-title">Previous Period Trend</h2>
                <div class="placeholder-box">
                    💡 Connect your accounts in the <strong>Settings (API)</strong> section to import real metrics!
                </div>
            </div>

            <div id="tab-contents" class="tab-pane">
                <div class="form-card">
                    <h2 class="section-title" style="margin-top:0;">⚡ Quick Editor / New Content</h2>
                    <div class="form-group">
                        <input type="text" id="cTitle" placeholder="Content title">
                        <select id="cType">
                            <option value="Video">YouTube Video</option>
                            <option value="Post">Social Post</option>
                            <option value="Live">Live Stream</option>
                        </select>
                        <select id="cStatus">
                            <option value="Published">Published</option>
                            <option value="Scheduled">Scheduled</option>
                            <option value="Draft">Draft</option>
                        </select>
                        <input type="text" id="cTags" placeholder="SEO Tags (e.g. gaming, tutorial)">
                        <button class="action-btn" onclick="addContent()">+ Add to Content Hub</button>
                    </div>
                </div>
                <h2 class="section-title">My Contents</h2>
                <div id="contents-list" class="content-list"></div>
            </div>

            <div id="tab-settings" class="tab-pane">
                <h2 class="section-title" style="margin-top:0;">🔗 Social Profile API Integration</h2>
                <p style="color:#94a3b8; font-size:14px; margin-bottom:20px;">
                    Enter your channel or account ID and API key (or OAuth Access Token) to enable metrics and KPI synchronization.
                </p>
                <div id="social-integrations-list"></div>
            </div>
        </div>

        <script>
            function toggleSidebar() {
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('overlay');
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            }

            function switchTab(tabName, btnElement) {
                document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
                document.getElementById('tab-' + tabName).classList.add('active');
                if (btnElement) btnElement.classList.add('active');
                
                const sidebar = document.getElementById('sidebar');
                if (sidebar.classList.contains('open')) { toggleSidebar(); }
                
                if (tabName === 'overview') loadOverview();
                if (tabName === 'contents') loadContents();
                if (tabName === 'settings') loadSettings();
            }

            async function loadOverview() {
                try {
                    const response = await fetch('/api/overview');
                    const data = await response.json();
                    const container = document.getElementById('kpi-container');
                    container.innerHTML = '';
                    if (!Array.isArray(data)) {
                        container.innerHTML = '<div class="placeholder-box">Error loading metrics.</div>';
                        return;
                    }
                    data.forEach(item => {
                        const isMasked = item.value === '--';
                        const changeClass = isMasked ? 'neutral' : 'pos';
                        container.innerHTML += 
                          '<div class="kpi-card">' +
                              '<div class="kpi-title">' + item.title + '</div>' +
                              '<div class="kpi-value">' + item.value + '</div>' +
                              '<div class="kpi-change ' + changeClass + '">' + item.change_percentage + '</div>' +
                          '</div>';
                    });
                } catch (err) {
                    document.getElementById('kpi-container').innerText = 'Error loading metrics.';
                }
            }

            async function loadContents() {
                try {
                    const response = await fetch('/api/contents');
                    const data = await response.json();
                    const container = document.getElementById('contents-list');
                    container.innerHTML = '';
                    if (!Array.isArray(data) || data.length === 0) {
                        container.innerHTML = '<div class="placeholder-box">No contents added yet. Add one above!</div>';
                        return;
                    }
                    data.forEach(item => {
                        const statusClass = item.status ? item.status.toLowerCase() : 'draft';
                        container.innerHTML += 
                          '<div class="content-item">' +
                              '<div class="content-header">' +
                                  '<span class="content-title">' + item.title + '</span>' +
                                  '<span class="badge ' + statusClass + '">' + item.status + '</span>' +
                              '</div>' +
                              '<div style="font-size: 13px; color: #38bdf8;">Type: ' + item.type + '</div>' +
                              '<div class="content-seo">🏷️ Tags: ' + (item.seo_tags || 'None') + '</div>' +
                          '</div>';
                    });
                } catch (err) {
                    document.getElementById('contents-list').innerText = 'Error loading contents.';
                }
            }

            async function addContent() {
                const title = document.getElementById('cTitle').value;
                const type = document.getElementById('cType').value;
                const status = document.getElementById('cStatus').value;
                const seo_tags = document.getElementById('cTags').value;
                if (!title.trim()) { alert('Please enter a valid title'); return; }
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
                    } else { alert('Error saving content'); }
                } catch (err) { alert('Server connection error'); }
            }

            async function loadSettings() {
                try {
                    const response = await fetch('/api/settings/socials');
                    const data = await response.json();
                    const container = document.getElementById('social-integrations-list');
                    container.innerHTML = '';
                    data.forEach(item => {
                        const isConn = item.is_connected;
                        const statusText = isConn ? 'Connected' : 'Disconnected';
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
                                  '<button class="action-btn" onclick="saveSocial(\'' + item.platform + '\')">Save & Update ' + item.platform + '</button>' +
                              '</div>' +
                          '</div>';
                    });
                } catch (err) {
                    document.getElementById('social-integrations-list').innerText = 'Error loading settings.';
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
                        alert('Settings saved for ' + platform + '!');
                        loadSettings();
                    } else { alert('Error saving settings.'); }
                } catch (err) { alert('Connection error.'); }
            }

            loadOverview();
            loadContents();
        </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(\`Server listening on port \${port}\`);
});
