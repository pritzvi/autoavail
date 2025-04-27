const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  // Add more scopes if needed
];

app.get('/api/auth/url', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    include_granted_scopes: true
  });
  res.json({ url: authUrl });
});

app.get('/api/auth/callback/google', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.cookie('gcal_token', tokens.access_token, {
      httpOnly: false,
      maxAge: 3600 * 1000,
      sameSite: 'Lax',
      secure: false,
      path: '/',
    });

    if (tokens.refresh_token) {
      res.cookie('gcal_refresh_token', tokens.refresh_token, {
        httpOnly: false,
        maxAge: 30 * 24 * 3600 * 1000,
        sameSite: 'Lax',
        secure: false,
        path: '/',
      });
    }

    res.send(`<html><body>
      <h1>Authentication successful!</h1>
      <p>Copy this token and paste it into the extension if prompted:</p>
      <code>${tokens.access_token}</code>
      <p>You can close this tab and return to the extension.</p>
    </body></html>`);
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.status(500).send('Token exchange failed: ' + err.message);
  }
});

app.get('/api/calendar/events', async (req, res) => {
  // Accept token from Authorization header or cookie
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : req.cookies.gcal_token;
  console.log('Authorization header:', req.headers.authorization);
  console.log('Cookies:', req.cookies);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const now = new Date().toISOString();
    const axios = require('axios');
    const gcalRes = await axios.get(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=10&orderBy=startTime&singleEvents=true&timeMin=${now}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    res.status(200).json(gcalRes.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.listen(3000, () => {
  console.log('Backend listening on http://localhost:3000');
}); 