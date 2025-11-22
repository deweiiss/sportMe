import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken } from '../services/stravaApi';

const AuthPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already authenticated
    const token = getAccessToken();
    if (token) {
      navigate('/data');
    }
  }, [navigate]);

  const handleConnect = () => {
    const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
    const redirectUri = import.meta.env.VITE_STRAVA_REDIRECT_URI;
    const scope = 'activity:read_all';
    
    // Validate environment variables
    if (!clientId || clientId === 'your_client_id_here') {
      alert('Error: Please set VITE_STRAVA_CLIENT_ID in your .env file with your actual Strava Client ID');
      console.error('VITE_STRAVA_CLIENT_ID is not set or is using placeholder value');
      return;
    }
    
    if (!redirectUri || redirectUri === 'your_redirect_uri_here') {
      alert('Error: Please set VITE_STRAVA_REDIRECT_URI in your .env file');
      console.error('VITE_STRAVA_REDIRECT_URI is not set');
      return;
    }
    
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    
    console.log('Redirecting to Strava OAuth:', { clientId, redirectUri });
    window.location.href = authUrl;
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h1>SportMe</h1>
        <p>Connect your Strava account to view your workout data</p>
        <button onClick={handleConnect} className="connect-button">
          Connect with Strava
        </button>
      </div>
    </div>
  );
};

export default AuthPage;

