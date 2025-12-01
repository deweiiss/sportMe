import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, signUp, getCurrentUser, signOut } from '../services/auth';
import { checkUserStravaConnection } from '../services/supabase';

const AuthPage = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      const { user } = await getCurrentUser();
      if (user) {
        setIsAuthenticated(true);
        // Check if Strava is connected for this user (verify in database, not just localStorage)
        const { hasStrava } = await checkUserStravaConnection();
        if (hasStrava) {
          navigate('/data');
        }
        // If authenticated but Strava not connected, show Strava connect option
      } else {
        setIsAuthenticated(false);
      }
    };
    checkAuth();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let result;
      if (isSignUp) {
        result = await signUp(email, password);
      } else {
        result = await signIn(email, password);
      }

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      // User successfully authenticated
      setIsAuthenticated(true);
      setLoading(false);

      // Check if Strava is already connected for this user (verify in database)
      const { hasStrava } = await checkUserStravaConnection();
      if (hasStrava) {
        navigate('/data');
      }
      // If Strava not connected, the UI will show the connect button
    } catch (err) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  const handleConnectStrava = () => {
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

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await signOut();
      setIsAuthenticated(false);
      setEmail('');
      setPassword('');
      setError(null);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h1>SportMe</h1>
        
        {!isAuthenticated ? (
          /* Authentication Form - shown first */
          <div className="auth-form-section">
            <div className="auth-tabs">
              <button
                className={!isSignUp ? 'active' : ''}
                onClick={() => {
                  setIsSignUp(false);
                  setError(null);
                }}
                disabled={loading}
              >
                Sign In
              </button>
              <button
                className={isSignUp ? 'active' : ''}
                onClick={() => {
                  setIsSignUp(true);
                  setError(null);
                }}
                disabled={loading}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="your@email.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="auth-submit-button"
                disabled={loading}
              >
                {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>
          </div>
        ) : (
          /* Strava Connection Section - shown after authentication */
          <div className="strava-connect-section">
            <p>Welcome! Connect your Strava account to view your workout data</p>
            <button
              onClick={handleConnectStrava}
              className="connect-button"
            >
              Connect with Strava
            </button>
            <button
              onClick={handleLogout}
              className="logout-button"
              style={{ marginTop: '1rem' }}
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthPage;
