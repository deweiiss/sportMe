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
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-primary-start to-primary-end">
      <div className="bg-white/95 dark:bg-[#1a1a1a]/95 p-12 rounded-2xl shadow-2xl text-center max-w-md w-full">
        <h1 className="text-4xl mb-4 m-0 bg-gradient-to-br from-primary-start to-primary-end bg-clip-text text-transparent">SportMe</h1>
        
        {!isAuthenticated ? (
          /* Authentication Form - shown first */
          <div>
            <div className="flex mb-6 border-b border-gray-200 dark:border-gray-700">
              <button
                className={`flex-1 py-2 px-4 font-semibold transition-colors ${
                  !isSignUp 
                    ? 'border-b-2 border-primary-start text-primary-start' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                onClick={() => {
                  setIsSignUp(false);
                  setError(null);
                }}
                disabled={loading}
              >
                Sign In
              </button>
              <button
                className={`flex-1 py-2 px-4 font-semibold transition-colors ${
                  isSignUp 
                    ? 'border-b-2 border-primary-start text-primary-start' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                onClick={() => {
                  setIsSignUp(true);
                  setError(null);
                }}
                disabled={loading}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="email" className="text-left font-semibold text-gray-700 dark:text-gray-300">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="your@email.com"
                  className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-start dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="password" className="text-left font-semibold text-gray-700 dark:text-gray-300">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:border-primary-start dark:bg-gray-800 dark:text-white"
                />
              </div>

              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-6 bg-gradient-to-br from-primary-start to-primary-end text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
              </button>
            </form>
          </div>
        ) : (
          /* Strava Connection Section - shown after authentication */
          <div>
            <p className="text-gray-600 dark:text-gray-300 mb-8 text-lg">Welcome! Connect your Strava account to view your workout data</p>
            <button
              onClick={handleConnectStrava}
              className="w-full bg-gradient-to-br from-orange to-orange-light text-white border-none py-4 px-8 text-lg font-semibold rounded-lg cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
            >
              Connect with Strava
            </button>
            <button
              onClick={handleLogout}
              className="mt-4 w-full bg-gray-600 dark:bg-gray-700 text-white border-none py-3 px-6 rounded-lg cursor-pointer font-semibold transition-colors hover:bg-gray-700 dark:hover:bg-gray-600"
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
