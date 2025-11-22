import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken, getActivities, clearStravaData } from '../services/stravaApi';

const DataPage = () => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      // Check if user is authenticated
      const token = getAccessToken();
      if (!token) {
        navigate('/');
        return;
      }

      try {
        setLoading(true);
        const data = await getActivities(200); // Fetch up to 200 activities
        setActivities(data);
      } catch (err) {
        setError('Failed to fetch activities. Please try again.');
        console.error('Error fetching activities:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleDisconnect = () => {
    clearStravaData();
    navigate('/');
  };

  const formatDistance = (meters) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} m`;
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="data-page">
        <div className="data-container">
          <div className="loading-spinner"></div>
          <p>Loading your activities...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="data-page">
        <div className="data-container">
          <div className="error-message">
            <h2>Error</h2>
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="retry-button">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="data-page">
      <div className="data-container">
        <div className="header">
          <h1>Your Activities</h1>
          <button onClick={handleDisconnect} className="disconnect-button">
            Disconnect
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="no-activities">
            <p>No activities found.</p>
          </div>
        ) : (
          <div className="activities-list">
            <div className="activities-count">
              Found {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
            </div>
            {activities.map((activity) => (
              <div key={activity.id} className="activity-card">
                <div className="activity-header">
                  <h3>{activity.name || 'Untitled Activity'}</h3>
                  <span className="activity-type">{activity.type}</span>
                </div>
                <div className="activity-details">
                  <div className="detail-item">
                    <span className="detail-label">Date:</span>
                    <span className="detail-value">{formatDate(activity.start_date_local)}</span>
                  </div>
                  {activity.distance > 0 && (
                    <div className="detail-item">
                      <span className="detail-label">Distance:</span>
                      <span className="detail-value">{formatDistance(activity.distance)}</span>
                    </div>
                  )}
                  {activity.moving_time > 0 && (
                    <div className="detail-item">
                      <span className="detail-label">Duration:</span>
                      <span className="detail-value">{formatDuration(activity.moving_time)}</span>
                    </div>
                  )}
                  {activity.average_speed > 0 && (
                    <div className="detail-item">
                      <span className="detail-label">Avg Speed:</span>
                      <span className="detail-value">
                        {(activity.average_speed * 3.6).toFixed(2)} km/h
                      </span>
                    </div>
                  )}
                  {activity.total_elevation_gain > 0 && (
                    <div className="detail-item">
                      <span className="detail-label">Elevation Gain:</span>
                      <span className="detail-value">
                        {activity.total_elevation_gain.toFixed(0)} m
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DataPage;

