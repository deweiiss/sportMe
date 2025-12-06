import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeCodeForToken, getStravaAthleteId } from '../services/stravaApi';
import { getCurrentUser } from '../services/auth';
import { autoSyncActivities } from '../services/stravaSync';
import { checkUserStravaConnection } from '../services/supabase';

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
        // Check if user is authenticated
        const { user, error: authError } = await getCurrentUser();
        if (authError || !user) {
          setError('Please sign in first before connecting Strava.');
          setLoading(false);
          return;
        }

        await exchangeCodeForToken(code);
        
        // Verify athlete was created in database
        // Retry a few times in case of timing issues
        let athleteVerified = false;
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
          const { hasStrava } = await checkUserStravaConnection();
          if (hasStrava) {
            athleteVerified = true;
            console.log('✅ Athlete verified in database');
            break;
          }
        }
        
        if (!athleteVerified) {
          console.warn('⚠️ Athlete not found in database after token exchange. Sync may fail.');
        }
        
        // Trigger immediate sync after successful connection
        // This will sync 6 months of activities on first connection
        const stravaId = getStravaAthleteId();
        if (stravaId) {
          console.log('Triggering immediate sync after Strava connection...');
          // Run sync in background (don't wait for it to complete)
          autoSyncActivities(stravaId, true).then((result) => {
            if (result.success) {
              console.log(`✅ Initial sync completed: ${result.synced} activities synced`);
            } else {
              console.warn('Initial sync had issues:', result.error);
            }
          }).catch((err) => {
            console.error('Error during initial sync:', err);
            // Don't block navigation on sync error
          });
        } else {
          console.warn('No Strava athlete ID found after token exchange');
        }
        
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
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md w-full">
          <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mx-auto mb-6"></div>
          <p className="text-gray-700 dark:text-gray-300">Authenticating with Strava...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg">
            <h2 className="text-red-600 dark:text-red-400 mt-0 text-2xl font-semibold mb-4">Authentication Failed</h2>
            <p className="text-gray-600 dark:text-gray-400 my-4">{error}</p>
            <button 
              onClick={() => navigate('/')} 
              className="mt-4 bg-primary-start hover:bg-primary-end text-white border-none py-3 px-6 rounded-lg cursor-pointer font-semibold transition-colors"
            >
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

