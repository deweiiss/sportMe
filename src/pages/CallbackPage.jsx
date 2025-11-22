import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeCodeForToken } from '../services/stravaApi';

const CallbackPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(`Authentication error: ${errorParam}`);
      setLoading(false);
      return;
    }

    if (!code) {
      setError('No authorization code received');
      setLoading(false);
      return;
    }

    const handleTokenExchange = async () => {
      try {
        await exchangeCodeForToken(code);
        // Redirect to data page on success
        navigate('/data');
      } catch (err) {
        let errorMessage = 'Failed to exchange authorization code for token.';
        
        // Provide more specific error messages
        if (err.response) {
          const status = err.response.status;
          const errorData = err.response.data;
          
          if (status === 400) {
            if (errorData?.errors?.some(e => e.field === 'client_id')) {
              errorMessage = 'Invalid Client ID. Please check your .env file and ensure VITE_STRAVA_CLIENT_ID is set correctly.';
            } else if (errorData?.errors?.some(e => e.field === 'client_secret')) {
              errorMessage = 'Invalid Client Secret. Please check your .env file and ensure VITE_STRAVA_CLIENT_SECRET is set correctly.';
            } else {
              errorMessage = `Bad Request: ${errorData?.message || 'Invalid request parameters'}`;
            }
          } else if (status === 401) {
            errorMessage = 'Unauthorized. Please check your Strava API credentials.';
          }
          
          console.error('Token exchange error details:', {
            status,
            data: errorData,
            message: err.message
          });
        } else {
          console.error('Token exchange error:', err);
        }
        
        setError(errorMessage);
        setLoading(false);
      }
    };

    handleTokenExchange();
  }, [searchParams, navigate]);

  if (loading) {
    return (
      <div className="callback-page">
        <div className="callback-container">
          <div className="loading-spinner"></div>
          <p>Authenticating with Strava...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="callback-page">
        <div className="callback-container">
          <div className="error-message">
            <h2>Authentication Failed</h2>
            <p>{error}</p>
            <button onClick={() => navigate('/')} className="retry-button">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default CallbackPage;

