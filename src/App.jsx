import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import CallbackPage from './pages/CallbackPage';
import DataPage from './pages/DataPage';
import TrainingPlanPage from './pages/TrainingPlanPage';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/training" element={<TrainingPlanPage />} />
      </Routes>
    </Router>
  );
}

export default App;
