# AutoAvail

## Overview
AutoAvail is a Chrome extension designed to help busy students and professionals easily share their Google Calendar availability for the next 7 days, streamlining the process of networking, scheduling interviews, and coordinating meetings. Users can draft a detailed email with their availability drafted by an LLM (OpenAI) by simply typing the keyword {availability} into their email. By leveraging a local backend for secure OAuth authentication and Google Calendar API proxying, AutoAvail enables users to quickly view and share their free time slots directly from their browser. The extension allows for customizable constraints—such as specifying working hours (e.g., 9am–5pm) or blocking out recurring busy periods (like lunch breaks)—making it a practical tool for anyone who needs a fast, flexible way to communicate their availability without the hassle of manual calendar checks.

## Landing Page: https://natalielim.github.io/autoavail/

---

## Setup Instructions

### 1. Get a Google API Client ID
- Follow the official guide: [Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- ENABLE Google Calendar API in your cloud console -> Credentials -> Create Credentials (follow steps below)
- **Steps:**
  1. Go to the [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
  2. Create/select a project
  3. Create OAuth 2.0 credentials of type **Web application**
  4. Set **Authorized JavaScript origins** to:
     - `http://localhost:3000`
  5. Set **Authorized redirect URIs** to:
     - `http://localhost:3000/api/auth/callback/google`
  6. Add your Google account as a **Test User** in the OAuth consent screen
  7. Save your **Client ID** and **Client Secret**

### 2a. Configure the Backend
- IMPORTANT: RENAME .env.example to .env or else it won't work! In `chrome_ext/backend/.env` (or `.env`), set:
  ```
  GOOGLE_CLIENT_ID=your-client-id
  GOOGLE_CLIENT_SECRET=your-client-secret
  GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google
  ```
### 2b. Configure the Backend

### 3. Install Backend Dependencies
- IMPORTANT: In `chrome_ext/autoavail/config.js`, set your own GOOGLE_CLIENT_ID (same as the one for backend). The existing credentials are wrong, REPLACE them with the same one as the one in backend/.env
```sh
cd chrome_ext/backend
npm install
```

### 4. Start the Backend
```sh
node server.js
```
- The backend will run at `http://localhost:3000`

### 5. Load the Chrome Extension
- Go to `chrome://extensions` in Chrome
- Enable **Developer mode**
- Click **Load unpacked**
- Select the `chrome_ext/autoavail` folder (not the backend folder)

### 6. Authenticate and Use
1. Click **Connect with Google** in the extension popup
2. Complete authentication in the new tab
3. Copy the access token from the success page
4. Paste it into the extension and click **Save Token**
5. Your availability for the next 7 days will be displayed

### 7. Get an OpenAI API key and make sure you have enough credits $$ in your OpenAI account - this will be used to generate an email draft using your {availability}

---

## Reference Links
- [Get your Google API client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Google Calendar API Overview](https://developers.google.com/workspace/calendar/api/guides/overview)

---

## Technical Architecture

- **Frontend (Chrome Extension):**
  - Simple popup UI (HTML/JS)
  - Lets user authenticate, paste token, and view availability
  - Stores access token in `chrome.storage.local`
  - Fetches events from backend using the token in the `Authorization` header
  - Computes and displays free 30-minute slots for each workday (9am-5pm) for the next 7 days

- **Backend (Express server):**
  - Handles OAuth flow with Google
  - Exchanges code for access token and displays it for the user to copy
  - Proxies requests to Google Calendar API, accepting the access token via `Authorization` header
  - CORS enabled for local development

---

## Features
- **Clyve Gassant: Trigger detection ("{availability}") with Gmail API. Use LLM to parse availability into readable format for email.**
- **Hemosoo Woo: Settings UI for customizing work hours & calendar preferences**
- **Natalie Lim: Landing page**
- **Prithvi Bale: Google Calendar API integration to fetch latest availability over next week**

---

## Troubleshooting
- Make sure you are using a Google account that is whitelisted as a test user in your OAuth consent screen
- Make sure your client ID, secret, and redirect URI match exactly in Google Cloud Console and your `.env` file
- If you see CORS or cookie issues, ensure you are using the access token in the Authorization header as described
- Make sure your OpenAI API account has enough credits

---

## Calendar API Reference
- [Google Calendar API Overview](https://developers.google.com/workspace/calendar/api/guides/overview) 
