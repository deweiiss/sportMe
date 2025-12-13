import { getAthleteProfile, getActivitiesFromSupabase, getTrainingPlans } from './supabase';

/**
 * Format activity data for display
 */
const formatActivity = (activity) => {
  const date = new Date(activity.start_date_local || activity.start_date);
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  let details = `${formattedDate}: ${activity.type || 'Activity'}`;
  
  if (activity.distance) {
    const distanceKm = (activity.distance / 1000).toFixed(1);
    details += ` - ${distanceKm} km`;
  }
  
  if (activity.moving_time) {
    const hours = Math.floor(activity.moving_time / 3600);
    const minutes = Math.floor((activity.moving_time % 3600) / 60);
    if (hours > 0) {
      details += ` - ${hours}h ${minutes}m`;
    } else {
      details += ` - ${minutes}m`;
    }
  }
  
  if (activity.average_speed && activity.type?.toLowerCase().includes('run')) {
    // Calculate pace in min/km for running
    const paceMinPerKm = (1000 / (activity.average_speed * 60)).toFixed(1);
    details += ` - ${paceMinPerKm} min/km`;
  }
  
  if (activity.name) {
    details += ` (${activity.name})`;
  }
  
  return details;
};

/**
 * Calculate activity statistics
 */
const calculateActivityStats = (activities) => {
  if (!activities || activities.length === 0) {
    return null;
  }
  
  const runningActivities = activities.filter(a => 
    a.type?.toLowerCase().includes('run') || a.type?.toLowerCase() === 'run'
  );
  
  if (runningActivities.length === 0) {
    return null;
  }
  
  const totalRuns = runningActivities.length;
  const totalDistance = runningActivities.reduce((sum, a) => sum + (a.distance || 0), 0);
  const avgDistance = totalDistance / totalRuns / 1000; // in km
  
  const avgPaceActivities = runningActivities.filter(a => a.average_speed && a.average_speed > 0);
  let avgPace = null;
  if (avgPaceActivities.length > 0) {
    const totalPace = avgPaceActivities.reduce((sum, a) => {
      const pace = 1000 / (a.average_speed * 60); // min/km
      return sum + pace;
    }, 0);
    avgPace = (totalPace / avgPaceActivities.length).toFixed(1);
  }
  
  const longestRun = runningActivities.reduce((longest, a) => {
    if (!longest || (a.distance || 0) > (longest.distance || 0)) {
      return a;
    }
    return longest;
  }, null);
  
  const longestDistance = longestRun ? (longestRun.distance / 1000).toFixed(1) : null;
  
  // Calculate frequency (activities in last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentActivities = runningActivities.filter(a => {
    const activityDate = new Date(a.start_date_local || a.start_date);
    return activityDate >= thirtyDaysAgo;
  });
  const frequency = `${recentActivities.length} runs in last 30 days`;
  
  return {
    totalRuns,
    avgDistance: avgDistance.toFixed(1),
    avgPace,
    longestDistance,
    frequency
  };
};

/**
 * Check if a plan is currently active (current date is within plan's date range)
 */
const isPlanActive = (plan) => {
  if (!plan.startDate || !plan.endDate) return false;
  
  const now = new Date();
  const startDate = new Date(plan.startDate);
  const endDate = new Date(plan.endDate);
  
  return now >= startDate && now <= endDate;
};

/**
 * Format training plan for display
 */
const formatTrainingPlan = (plan) => {
  const startDate = new Date(plan.startDate);
  const endDate = new Date(plan.endDate);
  const formattedStart = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formattedEnd = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  let planText = `\n  Type: ${plan.planType || 'Unknown'}\n  Date Range: ${formattedStart} - ${formattedEnd}`;
  
  if (plan.weeklyHours) {
    planText += `\n  Weekly Hours: ${plan.weeklyHours}`;
  }
  
  if (plan.planData && plan.planData.schedule) {
    planText += `\n  Structure:\n`;
    plan.planData.schedule.forEach((week, index) => {
      planText += `    Week ${week.week_number} (${week.phase_name}): ${week.weekly_focus}\n`;
      if (week.days && week.days.length > 0) {
        week.days.forEach(day => {
          if (!day.is_rest_day) {
            planText += `      ${day.day_name}: ${day.activity_title} (${day.total_estimated_duration_min} min)\n`;
          }
        });
      }
    });
  }
  
  return planText;
};

/**
 * Get user context for LLM conversations
 * Fetches athlete profile, recent activities, and training plans
 * @returns {Promise<string>} Formatted context string
 */
export const getUserContext = async () => {
  try {
    const contextParts = [];
    
    // Fetch athlete profile
    const profileResult = await getAthleteProfile();
    if (profileResult.data) {
      const profile = profileResult.data;
      contextParts.push('=== ATHLETE PROFILE ===');
      
      if (profile.firstname || profile.lastname) {
        contextParts.push(`Name: ${profile.firstname || ''} ${profile.lastname || ''}`.trim());
      }
      
      if (profile.weight) {
        contextParts.push(`Weight: ${profile.weight} kg`);
      }
      
      if (profile.city || profile.state || profile.country) {
        const locationParts = [profile.city, profile.state, profile.country].filter(Boolean);
        if (locationParts.length > 0) {
          contextParts.push(`Location: ${locationParts.join(', ')}`);
        }
      }
      
      if (profile.sex) {
        contextParts.push(`Gender: ${profile.sex === 'M' ? 'Male' : profile.sex === 'F' ? 'Female' : profile.sex}`);
      }
      
      if (profile.birthday) {
        const birthday = new Date(profile.birthday);
        contextParts.push(`Birthday: ${birthday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
      }
      
      const gearParts = [];
      if (profile.bikes && Array.isArray(profile.bikes) && profile.bikes.length > 0) {
        const bikeNames = profile.bikes.map(b => b.name || 'Unnamed bike').join(', ');
        gearParts.push(`Bikes: ${bikeNames}`);
      }
      if (profile.shoes && Array.isArray(profile.shoes) && profile.shoes.length > 0) {
        const shoeNames = profile.shoes.map(s => s.name || 'Unnamed shoes').join(', ');
        gearParts.push(`Shoes: ${shoeNames}`);
      }
      if (gearParts.length > 0) {
        contextParts.push(`Gear: ${gearParts.join('; ')}`);
      }
      
      contextParts.push(''); // Empty line
    }
    
    // Fetch training plans
    const plansResult = await getTrainingPlans();
    let activePlan = null;
    const plans = plansResult.data || [];
    
    if (plans.length > 0) {
      // Find active plan
      activePlan = plans.find(p => isPlanActive(p));
      
      contextParts.push('=== EXISTING TRAINING PLANS ===');
      if (activePlan) {
        contextParts.push(`* ACTIVE PLAN *`);
        contextParts.push(formatTrainingPlan(activePlan));
        contextParts.push('');
      }
      
      // List other recent plans (max 3 most recent)
      const otherPlans = plans.filter(p => !isPlanActive(p)).slice(0, 3);
      if (otherPlans.length > 0) {
        contextParts.push('Recent Plans:');
        otherPlans.forEach(plan => {
          contextParts.push(formatTrainingPlan(plan));
          contextParts.push('');
        });
      }
    } else {
      contextParts.push('=== EXISTING TRAINING PLANS ===');
      contextParts.push('No training plans found.');
      contextParts.push('');
    }
    
    // Fetch activities
    let activitiesToInclude = [];
    
    // First, get activities within active plan's date range if there is one
    if (activePlan && activePlan.startDate && activePlan.endDate) {
      const planStart = new Date(activePlan.startDate);
      const planEnd = new Date(activePlan.endDate);
      
      // Get all activities (up to 200 to ensure we get all plan activities)
      const planActivitiesResult = await getActivitiesFromSupabase(null, 200, 0);
      if (planActivitiesResult.data) {
        const planActivities = planActivitiesResult.data.filter(activity => {
          const activityDate = new Date(activity.start_date_local || activity.start_date);
          return activityDate >= planStart && activityDate <= planEnd;
        });
        
        // Include all activities from the plan period
        activitiesToInclude.push(...planActivities);
      }
    }
    
    // Get recent activities (last 10)
    const recentActivitiesResult = await getActivitiesFromSupabase(null, 10, 0);
    if (recentActivitiesResult.data) {
      // Merge with plan activities, avoiding duplicates
      const existingIds = new Set(activitiesToInclude.map(a => a.id || a.strava_id));
      const newActivities = recentActivitiesResult.data.filter(a => !existingIds.has(a.id || a.strava_id));
      activitiesToInclude.push(...newActivities);
      
      // Sort by date (most recent first) and limit to reasonable number
      activitiesToInclude.sort((a, b) => {
        const dateA = new Date(a.start_date_local || a.start_date);
        const dateB = new Date(b.start_date_local || b.start_date);
        return dateB - dateA;
      });
      
      // If we have plan activities + recent, keep plan activities + top 10 recent
      if (activitiesToInclude.length > 20) {
        const planActivityIds = activePlan ? 
          new Set(activitiesToInclude.slice(0, activitiesToInclude.length - 10).map(a => a.id || a.strava_id)) :
          new Set();
        
        const planActivities = activitiesToInclude.filter(a => planActivityIds.has(a.id || a.strava_id));
        const recentOnly = activitiesToInclude
          .filter(a => !planActivityIds.has(a.id || a.strava_id))
          .slice(0, 10);
        
        activitiesToInclude = [...planActivities, ...recentOnly];
      } else {
        // Limit to 20 total if we have many plan activities
        activitiesToInclude = activitiesToInclude.slice(0, 20);
      }
    }
    
    if (activitiesToInclude.length > 0) {
      contextParts.push('=== RECENT WORKOUTS ===');
      
      const stats = calculateActivityStats(activitiesToInclude);
      if (stats) {
        contextParts.push(`Summary: ${stats.totalRuns} runs, Average: ${stats.avgDistance} km, Average Pace: ${stats.avgPace ? stats.avgPace + ' min/km' : 'N/A'}, Longest: ${stats.longestDistance ? stats.longestDistance + ' km' : 'N/A'}, ${stats.frequency}`);
        contextParts.push('');
      }
      
      if (activePlan) {
        contextParts.push('Activities from active training plan:');
        const planActivities = activitiesToInclude.filter(a => {
          const activityDate = new Date(a.start_date_local || a.start_date);
          const planStart = new Date(activePlan.startDate);
          const planEnd = new Date(activePlan.endDate);
          return activityDate >= planStart && activityDate <= planEnd;
        });
        
        if (planActivities.length > 0) {
          planActivities.slice(0, 15).forEach(activity => {
            contextParts.push(formatActivity(activity));
          });
          if (planActivities.length > 15) {
            contextParts.push(`... and ${planActivities.length - 15} more activities from this plan`);
          }
          contextParts.push('');
        }
      }
      
      // Show last 10 activities (excluding duplicates already shown from plan)
      const recentToShow = activePlan ? 
        activitiesToInclude.filter(a => {
          const activityDate = new Date(a.start_date_local || a.start_date);
          const planStart = new Date(activePlan.startDate);
          const planEnd = new Date(activePlan.endDate);
          return !(activityDate >= planStart && activityDate <= planEnd);
        }).slice(0, 10) :
        activitiesToInclude.slice(0, 10);
      
      if (recentToShow.length > 0) {
        contextParts.push('Recent activities:');
        recentToShow.forEach(activity => {
          contextParts.push(formatActivity(activity));
        });
      }
    } else {
      contextParts.push('=== RECENT WORKOUTS ===');
      contextParts.push('No recent activities found.');
    }
    
    return contextParts.join('\n');
    
  } catch (error) {
    console.error('Error fetching user context:', error);
    return ''; // Return empty string on error so chat can still work
  }
};

