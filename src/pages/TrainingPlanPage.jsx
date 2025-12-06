import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateTrainingPlan, testOllamaConnection, getAvailableModels } from '../services/ollamaApi';
import { getAccessToken } from '../services/stravaApi';
import { getCurrentUser, signOut } from '../services/auth';
import { saveTrainingPlan, migrateTrainingPlansFromLocalStorage } from '../services/supabase';
import TrainingPlanCalendar from '../components/TrainingPlanCalendar';

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
    const checkAuth = async () => {
      const { user, error } = await getCurrentUser();
      if (error || !user) {
        navigate('/');
        return;
      }

      // Migrate training plans from localStorage to database (one-time)
      try {
        const migrationResult = await migrateTrainingPlansFromLocalStorage();
        if (migrationResult.migrated > 0) {
          console.log(`Migrated ${migrationResult.migrated} training plans from localStorage to database`);
        }
      } catch (err) {
        console.warn('Failed to migrate training plans:', err);
        // Don't block the app if migration fails
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
    };
    checkAuth();

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

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await signOut();
      navigate('/');
    }
  };

  // Handle plan changes from calendar
  const handlePlanChange = (updatedPlan) => {
    setPlanData(updatedPlan);
  };

  // Save plan to database
  const handleSavePlan = async () => {
    if (!planData || !selectedPlanType) {
      alert('No plan to save');
      return;
    }

    try {
      const planToSave = {
        planType: selectedPlanType,
        startDate: planData.startdate,
        endDate: planData.enddate,
        weeklyHours: weeklyHours, // Include weekly hours from state
        weeks: {
          week1: planData.week1,
          week2: planData.week2,
          week3: planData.week3,
          week4: planData.week4
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await saveTrainingPlan(planToSave);
      
      if (result.error) {
        alert(`Failed to save plan: ${result.error}`);
        return;
      }

      alert('Plan saved successfully!');
    } catch (err) {
      console.error('Error saving plan:', err);
      alert(`Failed to save plan: ${err.message}`);
    }
  };

  if (isConnected === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-start to-primary-end p-8">
        <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8 shadow-xl relative">
          <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-center text-gray-700 dark:text-gray-300">Checking Ollama connection...</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-start to-primary-end p-8">
        <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8 shadow-xl relative">
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 mb-4">
            <h2 className="mt-0 text-red-600 dark:text-red-400 text-2xl font-semibold mb-4">Ollama Not Connected</h2>
            <p className="my-4">Cannot connect to Ollama. Please make sure:</p>
            <ul className="my-4 pl-6">
              <li>Ollama is installed and running on your machine</li>
              <li>Ollama is running on the default port (11434)</li>
              <li>You have at least one model downloaded (e.g., <code className="bg-white dark:bg-gray-800 px-1 py-0.5 rounded font-mono text-red-600 dark:text-red-400">ollama pull llama3</code>)</li>
            </ul>
            <button 
              onClick={() => window.location.reload()} 
              className="py-3 px-6 mr-2 mt-2 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
              Retry Connection
            </button>
            <button 
              onClick={() => navigate('/data')} 
              className="py-3 px-6 mr-2 mt-2 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
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
      <div className="min-h-screen bg-gradient-to-br from-primary-start to-primary-end p-8">
        <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8 shadow-xl relative">
        <div className="flex justify-between items-center mb-8 pb-4 border-b-2 border-gray-200 dark:border-gray-700 flex-wrap gap-4">
          <h1 className="m-0 text-gray-900 dark:text-white text-3xl">Generate Training Plan</h1>
          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/data')} 
              className="py-3 px-6 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
              Back to Activities
            </button>
            <button 
              onClick={handleLogout} 
              className="py-3 px-6 bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
              Logout
            </button>
          </div>
        </div>

          <p className="text-center text-gray-600 dark:text-gray-300 text-lg mb-8">
            Select a training plan type to generate a personalized plan.
          </p>

          <div className="flex items-center justify-center gap-4 mb-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <label htmlFor="weekly-hours" className="font-semibold text-gray-900 dark:text-white text-base">Wöchentlich verfügbare Zeit:</label>
            <select
              id="weekly-hours"
              value={weeklyHours}
              onChange={(e) => setWeeklyHours(e.target.value)}
              className="px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-base bg-white dark:bg-gray-800 text-gray-900 dark:text-white cursor-pointer min-w-[200px] transition-colors focus:outline-none focus:border-primary-start disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={loading}
            >
              <option value="3-5h">3-5 Stunden</option>
              <option value="5-8h">5-8 Stunden</option>
              <option value="8-12h">8-12 Stunden</option>
              <option value="12h+">12+ Stunden</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
            <button
              onClick={() => handleGeneratePlan('ftp')}
              className="bg-gradient-to-br from-primary-start to-primary-end text-white border-none rounded-xl p-8 cursor-pointer transition-all text-center flex flex-col items-center min-h-[250px] hover:-translate-y-2 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
            >
              <div className="text-5xl mb-4">⚡</div>
              <h2 className="m-0 mb-2 text-2xl text-white">FTP Improvement</h2>
              <p className="m-0 text-base opacity-90 leading-relaxed">Generate a training plan focused on improving your Functional Threshold Power</p>
            </button>

            <button
              onClick={() => handleGeneratePlan('base')}
              className="bg-gradient-to-br from-primary-start to-primary-end text-white border-none rounded-xl p-8 cursor-pointer transition-all text-center flex flex-col items-center min-h-[250px] hover:-translate-y-2 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
            >
              <div className="text-5xl mb-4">🏔️</div>
              <h2 className="m-0 mb-2 text-2xl text-white">Base</h2>
              <p className="m-0 text-base opacity-90 leading-relaxed">Generate a base building training plan for endurance and aerobic capacity</p>
            </button>

            <button
              onClick={() => handleGeneratePlan('vo2max')}
              className="bg-gradient-to-br from-primary-start to-primary-end text-white border-none rounded-xl p-8 cursor-pointer transition-all text-center flex flex-col items-center min-h-[250px] hover:-translate-y-2 hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
              disabled={loading}
            >
              <div className="text-5xl mb-4">🔥</div>
              <h2 className="m-0 mb-2 text-2xl text-white">VO2max</h2>
              <p className="m-0 text-base opacity-90 leading-relaxed">Generate a training plan focused on improving your maximum oxygen uptake</p>
            </button>
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mb-4"></div>
              <p className="text-gray-700 dark:text-gray-300">Generating your training plan...</p>
            </div>
          )}

          {error && (
            <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 mb-4">
              <p className="my-4">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show generated plan
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-start to-primary-end p-8">
      <div className="max-w-6xl mx-auto bg-white dark:bg-gray-800 rounded-xl p-8 shadow-xl relative">
        <div className="flex justify-between items-center mb-8 pb-4 border-b-2 border-gray-200 dark:border-gray-700 flex-wrap gap-4">
          <h1 className="m-0 text-gray-900 dark:text-white text-3xl">
            {selectedPlanType === 'ftp' && 'FTP Improvement Plan'}
            {selectedPlanType === 'base' && 'Base Building Plan'}
            {selectedPlanType === 'vo2max' && 'VO2max Training Plan'}
          </h1>
          <div className="flex gap-4">
            <button 
              onClick={handleBack} 
              className="py-3 px-6 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
              Back to Options
            </button>
            <button 
              onClick={() => navigate('/data')} 
              className="py-3 px-6 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
              Back to Activities
            </button>
            <button 
              onClick={handleLogout} 
              className="py-3 px-6 bg-gray-600 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
              Logout
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-primary-start rounded-full animate-spin mb-4"></div>
            <p className="text-gray-700 dark:text-gray-300">Generating your training plan...</p>
          </div>
        )}

        {error && !planData && (
          <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 mb-4">
            <p className="my-4">{error}</p>
            <button 
              onClick={handleBack} 
              className="py-3 px-6 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
            >
              Try Again
            </button>
          </div>
        )}

        {planData ? (
          <div className="mt-8">
            <div className="flex gap-4 mb-6 justify-end">
              <button 
                onClick={handleSavePlan} 
                className="py-3 px-6 bg-green-600 hover:bg-green-700 text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
              >
                Save Plan
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(response);
                  alert('Copied to clipboard!');
                }}
                className="py-3 px-6 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
              >
                Copy Raw Response
              </button>
            </div>
            {error && (
              <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 mb-4">
                <p className="my-4">{error}</p>
              </div>
            )}
            <TrainingPlanCalendar
              planData={planData}
              onPlanChange={handlePlanChange}
              planType={selectedPlanType}
            />
          </div>
        ) : response && (
          <div className="mt-8 border-t-2 border-gray-200 dark:border-gray-700 pt-8">
            <div className="flex justify-end mb-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(response);
                  alert('Copied to clipboard!');
                }}
                className="py-3 px-6 bg-primary-start hover:bg-primary-end text-white border-none rounded-lg cursor-pointer text-base font-semibold transition-all hover:-translate-y-0.5"
              >
                Copy Plan
              </button>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-6 max-h-[70vh] overflow-y-auto">
              <pre className="m-0 whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-gray-900 dark:text-white">{response}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingPlanPage;

