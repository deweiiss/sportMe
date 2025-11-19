import { useMemo } from 'react';
import { StravaConnectButton } from './StravaConnectButton';
import { ActivitiesDump } from './ActivitiesDump';

export default function App() {
  const data = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');
    if (!encoded) return null;

    try {
      const json = JSON.parse(atob(encoded));
      return json;
    } catch (e) {
      console.error('Failed to decode:', e);
      return null;
    }
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Strava Sandbox</h1>

      {!data && <StravaConnectButton />}

      {data && <ActivitiesDump activities={data} />}
    </div>
  );
}

