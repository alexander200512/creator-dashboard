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

// Inizializzazione Database (uguale a prima)
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

// API Routes
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

// Servi index.html direttamente dalla root principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
