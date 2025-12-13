import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../services/auth';
import { migrateTrainingPlansFromLocalStorage, getTrainingPlans, deleteTrainingPlan, saveTrainingPlan } from '../services/supabase';
import TrainingPlanView from '../components/TrainingPlanView';

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
    // Use planData directly (new format is required)
    const planData = plan.planData || plan;
    setSelectedPlan({ ...plan, planData });
  };


  const handleClosePlan = () => {
    setSelectedPlan(null);
  };

  const handlePlanUpdate = async (updatedPlanData) => {
    if (!selectedPlan || !selectedPlan.id) return;
    
    try {
      // Convert new format back to database format if needed
      const planToUpdate = {
        id: selectedPlan.id,
        planType: updatedPlanData.meta?.plan_type || selectedPlan.planType,
        startDate: updatedPlanData.meta?.start_date || selectedPlan.startDate,
        endDate: selectedPlan.endDate,
        weeklyHours: selectedPlan.weeklyHours || null,
        planData: updatedPlanData // Store full plan data
      };

      const result = await saveTrainingPlan(planToUpdate);
      
      if (result.error) {
        console.error('Failed to update plan:', result.error);
        alert(`Failed to update plan: ${result.error}`);
        return;
      }

      const updatedPlans = savedPlans.map(p => 
        p.id === selectedPlan.id ? { ...result.data, planData: updatedPlanData } : p
      );
      setSavedPlans(updatedPlans);
      setSelectedPlan({ ...result.data, planData: updatedPlanData });
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

  const startTrainingPlanChat = () => {
    window.dispatchEvent(new Event('startTrainingPlanSequence'));
  };

    return (
      <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-4xl m-0 text-gray-900 dark:text-white">Training Plan</h1>
        <button
          onClick={startTrainingPlanChat}
          className="bg-yale-blue-500 hover:bg-yale-blue-600 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all"
        >
          Start training plan chat
        </button>
      </div>

        {/* Saved Training Plans Section */}
        {savedPlans.length > 0 && (
          <div className="mb-12">
            <h2 className="text-3xl m-0 mb-6 text-gray-900 dark:text-white">Saved Training Plans</h2>
            <div className="flex flex-col gap-6">
              {savedPlans.map((plan, index) => {
                const planName = plan.planData?.meta?.plan_name || getPlanTypeLabel(plan.planType);
                return (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <h3 className="m-0 text-xl text-gray-900 dark:text-white">{planName}</h3>
                      {plan.isActive && (
                        <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-medium">
                          Active
                        </span>
                      )}
                    </div>
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
                      <TrainingPlanView
                        planData={selectedPlan.planData || selectedPlan}
                        onPlanUpdate={handlePlanUpdate}
                      />
                    </div>
                  )}
                </div>
              );
              })}
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

