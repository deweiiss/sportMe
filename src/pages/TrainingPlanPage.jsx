import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../services/auth';
import { migrateTrainingPlansFromLocalStorage, getTrainingPlans, deleteTrainingPlan, saveTrainingPlan } from '../services/supabase';
import TrainingPlanCalendar from '../components/TrainingPlanCalendar';

const TrainingPlanPage = () => {
  const navigate = useNavigate();
  const [savedPlans, setSavedPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);

  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      const { user, error } = await getCurrentUser();
      if (error || !user) {
        navigate('/');
        return;
      }

      // Migrate training plans from localStorage to database (one-time)
      const migratePlans = async () => {
        try {
          const migrationResult = await migrateTrainingPlansFromLocalStorage();
          if (migrationResult.migrated > 0) {
            console.log(`Migrated ${migrationResult.migrated} training plans from localStorage to database`);
          }
        } catch (err) {
          console.warn('Failed to migrate training plans:', err);
        }
      };

      // Load saved training plans
      const loadSavedPlans = async () => {
        try {
          await migratePlans();
          const result = await getTrainingPlans();
          if (result.error) {
            console.error('Error loading training plans:', result.error);
            setSavedPlans([]);
            return;
          }
          setSavedPlans(result.data || []);
        } catch (err) {
          console.error('Error loading saved plans:', err);
          setSavedPlans([]);
        }
      };

      loadSavedPlans();
    };
    checkAuth();
  }, [navigate]);

  const formatPlanDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getPlanTypeLabel = (planType) => {
    const labels = {
      ftp: 'FTP Improvement',
      base: 'Base Building',
      vo2max: 'VO2max Training'
    };
    return labels[planType] || planType;
  };

  const handleViewPlan = (plan) => {
    const calendarPlan = {
      startdate: plan.startDate,
      enddate: plan.endDate,
      week1: plan.weeks.week1,
      week2: plan.weeks.week2,
      week3: plan.weeks.week3,
      week4: plan.weeks.week4
    };
    setSelectedPlan({ ...plan, calendarData: calendarPlan });
  };

  const handleClosePlan = () => {
    setSelectedPlan(null);
  };

  const handleSavedPlanChange = async (updatedPlan) => {
    if (!selectedPlan || !selectedPlan.id) return;
    
    try {
      const planToUpdate = {
        id: selectedPlan.id,
        planType: selectedPlan.planType,
        startDate: updatedPlan.startdate,
        endDate: updatedPlan.enddate,
        weeklyHours: selectedPlan.weeklyHours || null,
        weeks: {
          week1: updatedPlan.week1,
          week2: updatedPlan.week2,
          week3: updatedPlan.week3,
          week4: updatedPlan.week4
        }
      };

      const result = await saveTrainingPlan(planToUpdate);
      
      if (result.error) {
        console.error('Failed to update plan:', result.error);
        alert(`Failed to update plan: ${result.error}`);
        return;
      }

      const updatedPlans = savedPlans.map(p => 
        p.id === selectedPlan.id ? result.data : p
      );
      setSavedPlans(updatedPlans);
      setSelectedPlan({ ...result.data, calendarData: updatedPlan });
    } catch (err) {
      console.error('Error updating plan:', err);
      alert(`Failed to update plan: ${err.message}`);
    }
  };

  const handleDeletePlan = async (plan) => {
    if (!plan.id) {
      console.error('Plan missing ID, cannot delete');
      return;
    }

    if (window.confirm('Are you sure you want to delete this training plan?')) {
      try {
        const result = await deleteTrainingPlan(plan.id);
        
        if (result.error) {
          alert(`Failed to delete plan: ${result.error}`);
          return;
        }

        const filteredPlans = savedPlans.filter(p => p.id !== plan.id);
        setSavedPlans(filteredPlans);
        
        if (selectedPlan && selectedPlan.id === plan.id) {
          setSelectedPlan(null);
        }
      } catch (err) {
        console.error('Error deleting plan:', err);
        alert(`Failed to delete plan: ${err.message}`);
      }
    }
  };

    return (
      <div>
        <h1 className="text-4xl m-0 mb-8 text-gray-900 dark:text-white">Training Plan</h1>

        {/* Saved Training Plans Section */}
        {savedPlans.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl m-0 mb-6 text-gray-900 dark:text-white">Saved Training Plans</h2>
            <div className="flex flex-col gap-6">
              {savedPlans.map((plan, index) => (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                    <h3 className="m-0 text-xl text-gray-900 dark:text-white">{getPlanTypeLabel(plan.planType)}</h3>
                    <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                      {formatPlanDate(plan.startDate)} - {formatPlanDate(plan.endDate)}
                    </span>
                  </div>
                  <div className="flex gap-4 mb-4">
                    <button 
                      onClick={() => handleViewPlan(plan)}
                      className="bg-primary-start hover:bg-primary-end text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      {selectedPlan && 
                       selectedPlan.id === plan.id 
                        ? 'Hide Plan' 
                        : 'View/Edit Plan'}
                    </button>
                    <button 
                      onClick={() => handleDeletePlan(plan)}
                      className="bg-red-600 hover:bg-red-700 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      Delete
                    </button>
                  </div>
                  {selectedPlan && 
                   selectedPlan.id === plan.id && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                      <TrainingPlanCalendar
                        planData={selectedPlan.calendarData}
                        onPlanChange={handleSavedPlanChange}
                        planType={plan.planType}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          )}

        {savedPlans.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-md">
            <p className="text-gray-600 dark:text-gray-300 text-lg text-center">
              No saved training plans yet. Create a training plan through the chat interface!
            </p>
          </div>
        )}
      </div>
  );
};

export default TrainingPlanPage;

