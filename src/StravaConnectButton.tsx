export function StravaConnectButton() {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
  // Use environment variable, or fall back to current origin + callback path
  const redirectUri = import.meta.env.VITE_STRAVA_REDIRECT_URI || 
    `${window.location.origin}/oauth/strava/callback`;
  const scope = 'read,activity:read_all';

  const handleConnect = () => {
    if (!clientId) {
      alert(`Missing Client ID. Please check your .env file.`);
      return;
    }

    console.log('OAuth redirect URI:', redirectUri);
    console.log('Client ID:', clientId);
    console.log('Current origin:', window.location.origin);

    const url = new URL('https://www.strava.com/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('approval_prompt', 'auto');
    url.searchParams.set('scope', scope);

    window.location.href = url.toString();
  };

  return (
    <div>
      <button onClick={handleConnect}>
        Connect Strava
      </button>
      {(!clientId || !redirectUri) && (
        <p style={{ color: 'red', marginTop: 10 }}>
          ⚠️ Missing environment variables. Check your .env file.
        </p>
      )}
    </div>
  );
}

