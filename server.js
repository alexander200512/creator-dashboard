const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

app.use(express.json());

// ============================================
// INIZIALIZZAZIONE DATABASE
// ============================================
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

// ============================================
// API ROUTES
// ============================================
app.get('/api/overview', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kpi_metrics ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
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
  const platform = req.body.platform;
  const account_id = req.body.account_id;
  const api_key = req.body.api_key;
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

app.post('/api/settings/disconnect', async (req, res) => {
  const platform = req.body.platform;
  try {
    await pool.query(
      `UPDATE social_integrations
       SET account_id = '', api_key = '', is_connected = false, updated_at = CURRENT_TIMESTAMP
       WHERE platform = $1`,
      [platform]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error disconnecting platform" });
  }
});

// ============================================
// GOOGLE OAUTH (YouTube)
// ============================================
const { google } = require('googleapis');
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly'
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    await pool.query(
      `UPDATE social_integrations
       SET account_id = $1, api_key = $2, is_connected = $3, updated_at = CURRENT_TIMESTAMP
       WHERE platform = $4`,
      ['YouTube User', tokens.refresh_token || tokens.access_token, true, 'YouTube']
    );
    res.redirect('/?login=success');
  } catch (err) {
    console.error('Error during Google OAuth authentication:', err);
    res.status(500).redirect('/?login=error');
  }
});

// ============================================
// TWITCH OAUTH
// ============================================
const twitchClientId = process.env.TWITCH_CLIENT_ID;
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
const twitchRedirectUri = process.env.TWITCH_REDIRECT_URI || `${process.env.APP_URL}/auth/twitch/callback`;

app.get('/auth/twitch', (req, res) => {
  const scopes = 'user:read:email channel:read:subscriptions';
  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${twitchClientId}&redirect_uri=${encodeURIComponent(twitchRedirectUri)}&response_type=code&scope=${scopes}`;
  res.redirect(authUrl);
});

app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: twitchClientId,
        client_secret: twitchClientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: twitchRedirectUri
      })
    });
    const tokens = await tokenResponse.json();

    await pool.query(
      `UPDATE social_integrations
       SET account_id = $1, api_key = $2, is_connected = $3, updated_at = CURRENT_TIMESTAMP
       WHERE platform = $4`,
      ['Twitch User', tokens.access_token, true, 'Twitch']
    );
    res.redirect('/?login=success');
  } catch (err) {
    console.error('Error during Twitch OAuth authentication:', err);
    res.status(500).redirect('/?login=error');
  }
});

// ============================================
// SERVIZIO FRONTEND
// ============================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
