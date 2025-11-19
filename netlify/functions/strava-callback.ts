import type { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

export const handler: Handler = async (event) => {
  const code = event.queryStringParameters?.code;

  if (!code) {
    return { statusCode: 400, body: 'Missing `code` query param.' };
  }

  const clientId = process.env.VITE_STRAVA_CLIENT_ID!;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET!;
  const redirectUri = process.env.STRAVA_REDIRECT_URI!;

  // 1) Exchange code → token
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = await tokenRes.json();

  if (!tokenRes.ok) {
    return {
      statusCode: 500,
      body: `OAuth exchange failed: ${JSON.stringify(tokenJson)}`,
    };
  }

  const accessToken = tokenJson.access_token;

  // 2) Fetch activities
  const actRes = await fetch(
    'https://www.strava.com/api/v3/athlete/activities?per_page=30',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const activities = await actRes.json();

  // Encode JSON to transport back to frontend
  const payload = Buffer.from(JSON.stringify(activities)).toString('base64');

  // 3) Redirect to frontend with data in hash
  return {
    statusCode: 302,
    headers: {
      Location: `/?data=${payload}`,
    },
  };
};

