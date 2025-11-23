import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateTrainingPlan, testOllamaConnection, getAvailableModels } from '../services/ollamaApi';
import { getAccessToken } from '../services/stravaApi';
import TrainingPlanCalendar from '../components/TrainingPlanCalendar';
import './TrainingPlanPage.css';

// Training plan prompts - functions that take weeklyHours parameter
const TRAINING_PROMPTS = {
  ftp: (weeklyHours) => `Du bist ein professioneller Cycling-Coach.

Erstelle einen 4-Wochen-Trainingsplan, der gezielt die FTP verbessert, mit Schwerpunkt auf Sweetspot-, Threshold- und submaximalen Intervallen.

Anforderungen:

Die 4 Wochen sollen direkt starten, d. h. Woche 1 ist vollwertig.

Der Plan richtet sich an einen ambitionierten Amateur mit ${weeklyHours} pro Woche verfügbarer Zeit.

Der Plan soll progressiv sein: zunehmende Sweetspot-Umfänge, längere Intervalle, in Woche 4 Deload/leichterer Block.

WICHTIG: Workout-Beschreibungen müssen KURZ und KLAR sein. Beispiele:
- "4x3 sweetspot intervalle"
- "2h Z2"
- "Rest"
- "3x15min @ 90% FTP"
- "VO2max 5x4min"

KEINE langen Beschreibungen mit Routen, Orten oder Zwift-Namen. Nur die essentiellen Informationen: Dauer, Intensität, Intervalle.

WICHTIG: Gib die Antwort AUSSCHLIESSLICH als JSON-Objekt im folgenden Format zurück (kein zusätzlicher Text):

{
  "startdate": "YYYY-MM-DD",
  "enddate": "YYYY-MM-DD",
  "week1": {
    "mon": "Workout-Beschreibung oder 'Rest'",
    "tue": "Workout-Beschreibung oder 'Rest'",
    "wed": "Workout-Beschreibung oder 'Rest'",
    "thu": "Workout-Beschreibung oder 'Rest'",
    "fri": "Workout-Beschreibung oder 'Rest'",
    "sat": "Workout-Beschreibung oder 'Rest'",
    "sun": "Workout-Beschreibung oder 'Rest'"
  },
  "week2": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  },
  "week3": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  },
  "week4": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  }
}

startdate und enddate sollen das Datum des ersten Montags und letzten Sonntags der 4 Wochen sein.`,

  base: (weeklyHours) => `Du bist ein professioneller Cycling-Coach.

Erstelle einen 4-Wochen-Trainingsplan, der die aerobe Basis / Base Endurance maximiert.

Fokus:

Überwiegend Z2-Langfahrten, ruhige, kontrollierte Intensität

1 optionaler Technik-/Kraftausdauer-Tag pro Woche (z. B. niedrige Kadenz 60–70 rpm im Z2)

${weeklyHours} pro Woche, realistisch für ambitionierte Freizeitfahrer

Woche 4 leicht reduziertes Volumen (Deload)

Die 4 Wochen sollen sofort beginnen

WICHTIG: Workout-Beschreibungen müssen KURZ und KLAR sein. Beispiele:
- "3h Z2"
- "2h Z2 niedrige Kadenz"
- "Rest"
- "2.5h Z2"

KEINE langen Beschreibungen mit Routen, Orten oder Zwift-Namen. Nur die essentiellen Informationen: Dauer und Ziel-Zone.

WICHTIG: Gib die Antwort AUSSCHLIESSLICH als JSON-Objekt im folgenden Format zurück (kein zusätzlicher Text):

{
  "startdate": "YYYY-MM-DD",
  "enddate": "YYYY-MM-DD",
  "week1": {
    "mon": "Workout-Beschreibung oder 'Rest'",
    "tue": "Workout-Beschreibung oder 'Rest'",
    "wed": "Workout-Beschreibung oder 'Rest'",
    "thu": "Workout-Beschreibung oder 'Rest'",
    "fri": "Workout-Beschreibung oder 'Rest'",
    "sat": "Workout-Beschreibung oder 'Rest'",
    "sun": "Workout-Beschreibung oder 'Rest'"
  },
  "week2": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  },
  "week3": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  },
  "week4": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  }
}

startdate und enddate sollen das Datum des ersten Montags und letzten Sonntags der 4 Wochen sein.`,

  vo2max: (weeklyHours) => `Du bist ein professioneller Cycling-Coach.

Erstelle einen 4-Wochen-Trainingsplan, der gezielt die VO2max steigert.

Anforderungen:

Fokus auf intensiven Einheiten: 3–6-Minuten-Intervalle, z. B. 5×4 Min @ 110–120% FTP

Jede Woche 2 VO2max-Sessions, dazwischen ausreichend Z2- und Recovery-Tage

${weeklyHours} pro Woche

Woche 4 = leicht reduziertes Volumen mit 1 intensiven Session

Die 4 Wochen sollen direkt beginnen

WICHTIG: Workout-Beschreibungen müssen KURZ und KLAR sein. Beispiele:
- "VO2max 5x4min"
- "6x3min @ 120% FTP"
- "2h Z2"
- "Rest"

KEINE langen Beschreibungen mit Routen, Orten oder Zwift-Namen. Nur die essentiellen Informationen: Dauer, Intervalle, Intensität.

WICHTIG: Gib die Antwort AUSSCHLIESSLICH als JSON-Objekt im folgenden Format zurück (kein zusätzlicher Text):

{
  "startdate": "YYYY-MM-DD",
  "enddate": "YYYY-MM-DD",
  "week1": {
    "mon": "Workout-Beschreibung oder 'Rest'",
    "tue": "Workout-Beschreibung oder 'Rest'",
    "wed": "Workout-Beschreibung oder 'Rest'",
    "thu": "Workout-Beschreibung oder 'Rest'",
    "fri": "Workout-Beschreibung oder 'Rest'",
    "sat": "Workout-Beschreibung oder 'Rest'",
    "sun": "Workout-Beschreibung oder 'Rest'"
  },
  "week2": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  },
  "week3": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  },
  "week4": {
    "mon": "...",
    "tue": "...",
    "wed": "...",
    "thu": "...",
    "fri": "...",
    "sat": "...",
    "sun": "..."
  }
}

startdate und enddate sollen das Datum des ersten Montags und letzten Sonntags der 4 Wochen sein.`
};

// Parse LLM response into structured plan JSON
const parsePlanResponse = (response) => {
  if (!response || typeof response !== 'string') {
    return null;
  }

  // Try to extract JSON from the response
  // First, try to find JSON object in the response
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate structure
      if (parsed.startdate && parsed.enddate && 
          parsed.week1 && parsed.week2 && parsed.week3 && parsed.week4) {
        // Ensure all weeks have all days
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const weeks = ['week1', 'week2', 'week3', 'week4'];
        
        const isValid = weeks.every(week => 
          days.every(day => parsed[week] && parsed[week][day] !== undefined)
        );
        
        if (isValid) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  }

  // Fallback: try to parse the entire response as JSON
  try {
    const parsed = JSON.parse(response.trim());
    if (parsed.startdate && parsed.enddate && 
        parsed.week1 && parsed.week2 && parsed.week3 && parsed.week4) {
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse response as JSON:', e);
  }

  return null;
};

const TrainingPlanPage = () => {
  const navigate = useNavigate();
  const [selectedPlanType, setSelectedPlanType] = useState(null);
  const [response, setResponse] = useState('');
  const [planData, setPlanData] = useState(null); // Parsed plan JSON
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(null);
  const [model, setModel] = useState('');
  const [weeklyHours, setWeeklyHours] = useState('5-8h');

  useEffect(() => {
    // Check if user is authenticated
    const token = getAccessToken();
    if (!token) {
      navigate('/');
      return;
    }

    // Test Ollama connection
    const checkConnection = async () => {
      const connected = await testOllamaConnection();
      setIsConnected(connected);
      
      if (connected) {
        try {
          const availableModels = await getAvailableModels();
          if (availableModels.length > 0) {
            setModel(availableModels[0]);
          }
        } catch (err) {
          console.error('Error fetching models:', err);
        }
      }
    };

    checkConnection();
  }, [navigate]);

  const handleGeneratePlan = async (planType) => {
    const promptFunction = TRAINING_PROMPTS[planType];
    
    if (!promptFunction || typeof promptFunction !== 'function') {
      setError(`Training plan prompt for ${planType} has not been configured yet.`);
      return;
    }

    if (!isConnected) {
      setError('Ollama is not connected. Please make sure Ollama is running.');
      return;
    }

    if (!weeklyHours) {
      setError('Bitte wähle die wöchentlich verfügbare Zeit aus.');
      return;
    }

    setSelectedPlanType(planType);
    setLoading(true);
    setError(null);
    setResponse('');

    try {
      const prompt = promptFunction(weeklyHours);
      const generatedPlan = await generateTrainingPlan(prompt, model || null, null);
      setResponse(generatedPlan);
      
      // Parse the response into structured JSON
      const parsed = parsePlanResponse(generatedPlan);
      if (parsed) {
        setPlanData(parsed);
      } else {
        // If parsing fails, still show the raw response but warn the user
        setError('Plan generated but could not be parsed into structured format. Showing raw response.');
        setPlanData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate training plan. Please try again.');
      console.error('Error:', err);
      setPlanData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedPlanType(null);
    setResponse('');
    setPlanData(null);
    setError(null);
  };

  // Handle plan changes from calendar
  const handlePlanChange = (updatedPlan) => {
    setPlanData(updatedPlan);
  };

  // Save plan to localStorage
  const handleSavePlan = () => {
    if (!planData || !selectedPlanType) {
      alert('No plan to save');
      return;
    }

    const planToSave = {
      planType: selectedPlanType,
      startDate: planData.startdate,
      endDate: planData.enddate,
      weeks: {
        week1: planData.week1,
        week2: planData.week2,
        week3: planData.week3,
        week4: planData.week4
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Get existing plans
    const existingPlans = JSON.parse(localStorage.getItem('trainingPlans') || '[]');
    
    // Add new plan
    existingPlans.push(planToSave);
    
    // Save to localStorage
    localStorage.setItem('trainingPlans', JSON.stringify(existingPlans));
    
    alert('Plan saved successfully!');
  };

  if (isConnected === null) {
    return (
      <div className="training-plan-page">
        <div className="training-container">
          <div className="loading-spinner"></div>
          <p>Checking Ollama connection...</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="training-plan-page">
        <div className="training-container">
          <div className="error-message">
            <h2>Ollama Not Connected</h2>
            <p>Cannot connect to Ollama. Please make sure:</p>
            <ul>
              <li>Ollama is installed and running on your machine</li>
              <li>Ollama is running on the default port (11434)</li>
              <li>You have at least one model downloaded (e.g., <code>ollama pull llama3</code>)</li>
            </ul>
            <button onClick={() => window.location.reload()} className="retry-button">
              Retry Connection
            </button>
            <button onClick={() => navigate('/data')} className="back-button">
              Back to Activities
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show plan selection if no plan is selected or generated
  if (!selectedPlanType || !response) {
    return (
      <div className="training-plan-page">
        <div className="training-container">
          <div className="header">
            <h1>Generate Training Plan</h1>
            <button onClick={() => navigate('/data')} className="back-button">
              Back to Activities
            </button>
          </div>

          <p className="instruction-text">
            Select a training plan type to generate a personalized plan.
          </p>

          <div className="weekly-time-selector">
            <label htmlFor="weekly-hours">Wöchentlich verfügbare Zeit:</label>
            <select
              id="weekly-hours"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              className="weekly-hours-select"
              disabled={loading}
            >
              <option value="3-5h">3-5 Stunden</option>
              <option value="5-8h">5-8 Stunden</option>
              <option value="8-12h">8-12 Stunden</option>
              <option value="12h+">12+ Stunden</option>
            </select>
          </div>

          <div className="plan-options">
            <button
              onClick={() => handleGeneratePlan('ftp')}
              className="plan-card"
              disabled={loading}
            >
              <div className="plan-icon">⚡</div>
              <h2>FTP Improvement</h2>
              <p>Generate a training plan focused on improving your Functional Threshold Power</p>
            </button>

            <button
              onClick={() => handleGeneratePlan('base')}
              className="plan-card"
              disabled={loading}
            >
              <div className="plan-icon">🏔️</div>
              <h2>Base</h2>
              <p>Generate a base building training plan for endurance and aerobic capacity</p>
            </button>

            <button
              onClick={() => handleGeneratePlan('vo2max')}
              className="plan-card"
              disabled={loading}
            >
              <div className="plan-icon">🔥</div>
              <h2>VO2max</h2>
              <p>Generate a training plan focused on improving your maximum oxygen uptake</p>
            </button>
          </div>

          {loading && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <p>Generating your training plan...</p>
            </div>
          )}

          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show generated plan
  return (
    <div className="training-plan-page">
      <div className="training-container">
        <div className="header">
          <h1>
            {selectedPlanType === 'ftp' && 'FTP Improvement Plan'}
            {selectedPlanType === 'base' && 'Base Building Plan'}
            {selectedPlanType === 'vo2max' && 'VO2max Training Plan'}
          </h1>
          <div className="header-actions">
            <button onClick={handleBack} className="back-button">
              Back to Options
            </button>
            <button onClick={() => navigate('/data')} className="back-button">
              Back to Activities
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
            <p>Generating your training plan...</p>
          </div>
        )}

        {error && !planData && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={handleBack} className="retry-button">
              Try Again
            </button>
          </div>
        )}

        {planData ? (
          <div className="plan-calendar-container">
            <div className="plan-actions">
              <button onClick={handleSavePlan} className="save-button">
                Save Plan
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(response);
                  alert('Copied to clipboard!');
                }}
                className="copy-button"
              >
                Copy Raw Response
              </button>
            </div>
            {error && (
              <div className="error-message" style={{ marginBottom: '1rem' }}>
                <p>{error}</p>
              </div>
            )}
            <TrainingPlanCalendar
              planData={planData}
              onPlanChange={handlePlanChange}
              planType={selectedPlanType}
            />
          </div>
        ) : response && (
          <div className="response-container">
            <div className="response-header">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(response);
                  alert('Copied to clipboard!');
                }}
                className="copy-button"
              >
                Copy Plan
              </button>
            </div>
            <div className="response-content">
              <pre>{response}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingPlanPage;

