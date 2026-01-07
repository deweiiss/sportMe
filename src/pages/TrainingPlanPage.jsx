import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../services/auth';
import {
  migrateTrainingPlansFromLocalStorage,
  getTrainingPlans,
  deleteTrainingPlan,
  saveTrainingPlan,
  archiveTrainingPlan,
  reactivateTrainingPlan
} from '../services/supabase';
import TrainingPlanView from '../components/TrainingPlanView';

const TrainingPlanPage = () => {
  const navigate = useNavigate();
  const [savedPlans, setSavedPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

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

  // Archive a plan
  const handleArchivePlan = async (plan) => {
    if (!plan.id) {
      console.error('Plan missing ID, cannot archive');
      return;
    }

    try {
      const result = await archiveTrainingPlan(plan.id);

      if (result.error) {
        alert(`Failed to archive plan: ${result.error}`);
        return;
      }

      // Reload plans
      const updatedPlans = await getTrainingPlans();
      if (updatedPlans.data) {
        setSavedPlans(updatedPlans.data);
      }

      // Close plan if it was being viewed
      if (selectedPlan && selectedPlan.id === plan.id) {
        setSelectedPlan(null);
      }
    } catch (err) {
      console.error('Error archiving plan:', err);
      alert(`Failed to archive plan: ${err.message}`);
    }
  };

  // Reactivate a plan
  const handleReactivatePlan = async (plan) => {
    if (!plan.id) {
      console.error('Plan missing ID, cannot reactivate');
      return;
    }

    // Check if there's a currently active plan
    const activePlan = savedPlans.find(p => !p.isArchived);

    if (activePlan && activePlan.id !== plan.id) {
      if (!window.confirm(
        `Reactivating "${plan.planData?.meta?.plan_name || 'this plan'}" will archive your currently active plan "${activePlan.planData?.meta?.plan_name || 'Untitled'}". Continue?`
      )) {
        return;
      }
    }

    try {
      const result = await reactivateTrainingPlan(plan.id);

      if (result.error) {
        alert(`Failed to reactivate plan: ${result.error}`);
        return;
      }

      // Reload plans
      const updatedPlans = await getTrainingPlans();
      if (updatedPlans.data) {
        setSavedPlans(updatedPlans.data);
      }
    } catch (err) {
      console.error('Error reactivating plan:', err);
      alert(`Failed to reactivate plan: ${err.message}`);
    }
  };

  // Start a new training plan chat (creates new plan)
  const startTrainingPlanChat = () => {
    // Check if there's a currently active (non-archived) plan
    const activePlan = savedPlans.find(p => !p.isArchived);

    if (activePlan) {
      // Show confirmation dialog
      const planName = activePlan.planData?.meta?.plan_name || 'Untitled';
      if (!window.confirm(
        `By generating a new plan, you are archiving your currently active plan "${planName}". You can always reactivate plans later via the Training Plan section. Continue?`
      )) {
        return;
      }
    }

    window.dispatchEvent(new Event('startTrainingPlanSequence'));
  };

  // Start chat about an existing plan (to discuss/modify it)
  const startPlanDiscussion = (plan) => {
    const event = new CustomEvent('startPlanDiscussion', {
      detail: {
        plan: plan,
        planData: plan.planData || plan
      }
    });
    window.dispatchEvent(event);
  };

  // Separate active and archived plans
  const activePlans = savedPlans.filter(p => !p.isArchived);
  const archivedPlans = savedPlans.filter(p => p.isArchived);

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

      {/* Active Training Plan Section */}
      {activePlans.length > 0 && (
        <div className="mb-12">
          <h2 className="text-3xl m-0 mb-6 text-gray-900 dark:text-white">Active Plan</h2>
          <div className="flex flex-col gap-6">
            {activePlans.map((plan, index) => {
              const planName = plan.planData?.meta?.plan_name || getPlanTypeLabel(plan.planType);
              return (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg border-2 border-green-500 dark:border-green-600">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <h3 className="m-0 text-xl text-gray-900 dark:text-white">{planName}</h3>
                      <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-medium">
                        Active
                      </span>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                      {formatPlanDate(plan.startDate)} - {formatPlanDate(plan.endDate)}
                    </span>
                  </div>
                  <div className="flex gap-4 mb-4 flex-wrap">
                    <button
                      onClick={() => selectedPlan?.id === plan.id ? handleClosePlan() : handleViewPlan(plan)}
                      className="bg-primary-start hover:bg-primary-end text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      {selectedPlan && selectedPlan.id === plan.id ? 'Hide Plan' : 'View/Edit Plan'}
                    </button>
                    <button
                      onClick={() => startPlanDiscussion(plan)}
                      className="bg-yale-blue-500 hover:bg-yale-blue-600 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      💬 Discuss / Adjust
                    </button>
                    <button
                      onClick={() => handleArchivePlan(plan)}
                      className="bg-gray-600 hover:bg-gray-700 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan)}
                      className="bg-red-600 hover:bg-red-700 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      Delete
                    </button>
                  </div>
                  {selectedPlan && selectedPlan.id === plan.id && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                      <TrainingPlanView
                        planData={selectedPlan.planData || selectedPlan}
                        planId={selectedPlan.id}
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

      {/* Archived Training Plans Section */}
      {archivedPlans.length > 0 && (
        <div className="mb-12">
          <h2 className="text-3xl m-0 mb-6 text-gray-600 dark:text-gray-400">Archived Plans</h2>
          <div className="flex flex-col gap-6">
            {archivedPlans.map((plan, index) => {
              const planName = plan.planData?.meta?.plan_name || getPlanTypeLabel(plan.planType);
              return (
                <div key={index} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg opacity-70">
                  <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <h3 className="m-0 text-xl text-gray-900 dark:text-white">{planName}</h3>
                      <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium">
                        Archived
                      </span>
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                      {formatPlanDate(plan.startDate)} - {formatPlanDate(plan.endDate)}
                    </span>
                  </div>
                  <div className="flex gap-4 mb-4 flex-wrap">
                    <button
                      onClick={() => selectedPlan?.id === plan.id ? handleClosePlan() : handleViewPlan(plan)}
                      className="bg-primary-start hover:bg-primary-end text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      {selectedPlan && selectedPlan.id === plan.id ? 'Hide Plan' : 'View Plan'}
                    </button>
                    <button
                      onClick={() => handleReactivatePlan(plan)}
                      className="bg-green-600 hover:bg-green-700 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      Reactivate
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan)}
                      className="bg-red-600 hover:bg-red-700 text-white border-none py-2 px-4 rounded-md cursor-pointer font-semibold text-sm transition-all hover:-translate-y-0.5"
                    >
                      Delete
                    </button>
                  </div>
                  {selectedPlan && selectedPlan.id === plan.id && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                      <TrainingPlanView
                        planData={selectedPlan.planData || selectedPlan}
                        planId={selectedPlan.id}
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

      {/* No plans message */}
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

