import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import CallbackPage from './pages/CallbackPage';
import WorkoutsPage from './pages/WorkoutsPage';
import TrainingPlanPage from './pages/TrainingPlanPage';
import StatisticsPage from './pages/StatisticsPage';
import AboutMePage from './pages/AboutMePage';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route
          path="/workouts"
          element={
            <ProtectedRoute>
              <MainLayout>
                <WorkoutsPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/training"
          element={
            <ProtectedRoute>
              <MainLayout>
                <TrainingPlanPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/statistics"
          element={
            <ProtectedRoute>
              <MainLayout>
                <StatisticsPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <MainLayout>
                <AboutMePage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
        {/* Redirect old /data route to /workouts */}
        <Route
          path="/data"
          element={
            <ProtectedRoute>
              <MainLayout>
                <WorkoutsPage />
              </MainLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;

