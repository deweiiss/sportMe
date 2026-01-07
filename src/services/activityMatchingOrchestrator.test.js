import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getActivePlan,
  matchNewActivities,
  applyAutoMatches,
  acceptSuggestion
} from './activityMatchingOrchestrator';
import * as supabase from './supabase';
import * as contextRetrieval from './contextRetrieval';

// Mock dependencies
vi.mock('./supabase');
vi.mock('./contextRetrieval');

describe('activityMatchingOrchestrator', () => {
  // Mock data
  const mockAthleteBaseline = {
    avgPace: 5.5,
    longestDistance: 21.1,
    avgDistance: 8.5,
    avgRunsPerWeek: 4.0
  };

  const mockActivePlan = {
    id: 'plan-123',
    planType: 'COMPETITION',
    startDate: '2026-01-13',
    endDate: '2026-03-15',
    isActive: true,
    planData: {
      meta: {
        plan_id: 'plan-123',
        plan_type: 'COMPETITION',
        start_date: '2026-01-13'
      },
      periodization_overview: {
        macrocycle_goal: 'Complete 10K race',
        phases: ['Base', 'Build', 'Taper']
      },
      schedule: [
        {
          week_number: 1,
          phase_name: 'Base',
          weekly_focus: 'Build aerobic base',
          days: [
            {
              day_name: 'Monday',
              day_index: 0,
              is_rest_day: false,
              is_completed: false,
              activity_category: 'RUN',
              activity_title: 'Easy Run',
              total_estimated_duration_min: 40,
              workout_structure: [
                { segment_type: 'WARMUP', description: 'Easy warmup', duration_value: 5, duration_unit: 'min', intensity_zone: 1 },
                { segment_type: 'MAIN', description: 'Easy run', duration_value: 30, duration_unit: 'min', intensity_zone: 2 },
                { segment_type: 'COOLDOWN', description: 'Easy cooldown', duration_value: 5, duration_unit: 'min', intensity_zone: 1 }
              ]
            },
            {
              day_name: 'Tuesday',
              day_index: 1,
              is_rest_day: false,
              is_completed: false,
              activity_category: 'RUN',
              activity_title: 'Tempo Run',
              total_estimated_duration_min: 50,
              workout_structure: [
                { segment_type: 'WARMUP', description: 'Easy warmup', duration_value: 10, duration_unit: 'min', intensity_zone: 1 },
                { segment_type: 'MAIN', description: 'Tempo pace', duration_value: 30, duration_unit: 'min', intensity_zone: 4 },
                { segment_type: 'COOLDOWN', description: 'Easy cooldown', duration_value: 10, duration_unit: 'min', intensity_zone: 1 }
              ]
            },
            {
              day_name: 'Wednesday',
              day_index: 2,
              is_rest_day: true,
              is_completed: false,
              activity_category: 'REST'
            }
          ]
        }
      ]
    }
  };

  const mockActivities = [
    {
      id: 12345,
      type: 'Run',
      name: 'Morning Easy Run',
      start_date: '2026-01-13T08:00:00Z',
      start_date_local: '2026-01-13T08:00:00Z',
      distance: 6500, // 6.5 km
      moving_time: 2400, // 40 minutes
      average_speed: 2.71, // ~5.5 min/km pace
      has_heartrate: true,
      average_heartrate: 145
    },
    {
      id: 12346,
      type: 'Run',
      name: 'Tempo Tuesday',
      start_date: '2026-01-14T17:30:00Z',
      start_date_local: '2026-01-14T17:30:00Z',
      distance: 8200, // 8.2 km
      moving_time: 3000, // 50 minutes
      average_speed: 2.73, // Faster pace
      has_heartrate: true,
      average_heartrate: 165
    },
    {
      id: 12347,
      type: 'Run',
      name: 'Recovery jog',
      start_date: '2026-01-20T07:00:00Z',
      start_date_local: '2026-01-20T07:00:00Z',
      distance: 4000, // 4 km
      moving_time: 1500, // 25 minutes
      average_speed: 2.67,
      has_heartrate: true,
      average_heartrate: 130
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===================================================================
  // Suite 1: getActivePlan (2 tests)
  // ===================================================================
  describe('getActivePlan', () => {
    it('should return active plan when one exists', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [mockActivePlan]
      });

      const result = await getActivePlan();

      expect(result).toEqual(mockActivePlan);
      expect(supabase.getTrainingPlans).toHaveBeenCalledOnce();
    });

    it('should return null when no active plan exists', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [
          { ...mockActivePlan, isActive: false }
        ]
      });

      const result = await getActivePlan();

      expect(result).toBeNull();
    });
  });

  // ===================================================================
  // Suite 2: matchNewActivities (4 tests)
  // ===================================================================
  describe('matchNewActivities', () => {
    it('should match activities to active plan and apply high-confidence matches', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [mockActivePlan]
      });
      vi.mocked(contextRetrieval.getAthleteBaseline).mockResolvedValue(mockAthleteBaseline);
      vi.mocked(supabase.getActivitiesFromSupabase).mockResolvedValue({
        data: mockActivities
      });
      vi.mocked(supabase.updateTrainingPlanSchedule).mockResolvedValue({
        success: true
      });

      const result = await matchNewActivities();

      expect(result.success).toBe(true);
      expect(result.matched).toBeGreaterThan(0); // At least one high-confidence match
      expect(supabase.updateTrainingPlanSchedule).toHaveBeenCalled();
    });

    it('should return early if no active plan exists', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: []
      });

      const result = await matchNewActivities();

      expect(result.success).toBe(true);
      expect(result.matched).toBe(0);
      expect(result.message).toBe('No active plan');
    });

    it('should return early if no activities found', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [mockActivePlan]
      });
      vi.mocked(contextRetrieval.getAthleteBaseline).mockResolvedValue(mockAthleteBaseline);
      vi.mocked(supabase.getActivitiesFromSupabase).mockResolvedValue({
        data: []
      });

      const result = await matchNewActivities();

      expect(result.success).toBe(true);
      expect(result.matched).toBe(0);
      expect(result.message).toBe('No activities to match');
    });

    it('should filter activities by date if sinceDate provided', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [mockActivePlan]
      });
      vi.mocked(contextRetrieval.getAthleteBaseline).mockResolvedValue(mockAthleteBaseline);
      vi.mocked(supabase.getActivitiesFromSupabase).mockResolvedValue({
        data: mockActivities
      });
      vi.mocked(supabase.updateTrainingPlanSchedule).mockResolvedValue({
        success: true
      });

      // Only activities after 2026-01-14 should be matched
      const result = await matchNewActivities(null, '2026-01-14T00:00:00Z');

      expect(result.success).toBe(true);
      // Should skip activity 12345 (Jan 13), but match 12346 and possibly 12347
    });
  });

  // ===================================================================
  // Suite 3: applyAutoMatches (3 tests)
  // ===================================================================
  describe('applyAutoMatches', () => {
    it('should update plan with match metadata for all matches', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [mockActivePlan]
      });
      vi.mocked(supabase.updateTrainingPlanSchedule).mockResolvedValue({
        success: true
      });

      const matches = [
        {
          activity: mockActivities[0],
          match: {
            weekIndex: 0,
            dayIndex: 0,
            matchScore: 0.85,
            confidence: 'high'
          }
        }
      ];

      const result = await applyAutoMatches('plan-123', matches);

      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(1);
      expect(supabase.updateTrainingPlanSchedule).toHaveBeenCalledWith(
        'plan-123',
        expect.objectContaining({
          meta: mockActivePlan.planData.meta,
          schedule: expect.any(Array)
        })
      );

      // Verify the schedule was updated with match data
      const updateCall = vi.mocked(supabase.updateTrainingPlanSchedule).mock.calls[0];
      const updatedPlanData = updateCall[1];
      const matchedDay = updatedPlanData.schedule[0].days[0];

      expect(matchedDay.is_completed).toBe(true);
      expect(matchedDay.matched_activity_id).toBe(12345);
      expect(matchedDay.match_type).toBe('auto');
      expect(matchedDay.match_confidence).toBe(0.85);
    });

    it('should handle empty matches array', async () => {
      const result = await applyAutoMatches('plan-123', []);

      expect(result.success).toBe(true);
      expect(result.matchedCount).toBe(0);
      expect(supabase.updateTrainingPlanSchedule).not.toHaveBeenCalled();
    });

    it('should return error if plan not found', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: []
      });

      const matches = [
        {
          activity: mockActivities[0],
          match: { weekIndex: 0, dayIndex: 0, matchScore: 0.85 }
        }
      ];

      const result = await applyAutoMatches('nonexistent-plan', matches);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plan not found');
    });
  });

  // ===================================================================
  // Suite 4: acceptSuggestion (2 tests)
  // ===================================================================
  describe('acceptSuggestion', () => {
    it('should accept suggestion and update plan with suggested_accepted type', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [mockActivePlan]
      });
      vi.mocked(supabase.updateTrainingPlanSchedule).mockResolvedValue({
        success: true
      });

      const result = await acceptSuggestion('plan-123', 0, 1, mockActivities[1]);

      expect(result.success).toBe(true);
      expect(supabase.updateTrainingPlanSchedule).toHaveBeenCalled();

      // Verify match_type is suggested_accepted
      const updateCall = vi.mocked(supabase.updateTrainingPlanSchedule).mock.calls[0];
      const updatedPlanData = updateCall[1];
      const matchedDay = updatedPlanData.schedule[0].days[1];

      expect(matchedDay.match_type).toBe('suggested_accepted');
      expect(matchedDay.matched_activity_id).toBe(12346);
    });

    it('should return error if plan not found', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: []
      });

      const result = await acceptSuggestion('nonexistent-plan', 0, 0, mockActivities[0]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plan not found');
    });
  });

  // ===================================================================
  // Suite 5: Edge Cases (1 test)
  // ===================================================================
  describe('Edge Cases', () => {
    it('should handle activities outside plan date range', async () => {
      vi.mocked(supabase.getTrainingPlans).mockResolvedValue({
        data: [mockActivePlan]
      });
      vi.mocked(contextRetrieval.getAthleteBaseline).mockResolvedValue(mockAthleteBaseline);

      // Activities before plan starts
      const oldActivities = [
        {
          ...mockActivities[0],
          start_date: '2025-12-01T08:00:00Z',
          start_date_local: '2025-12-01T08:00:00Z'
        }
      ];

      vi.mocked(supabase.getActivitiesFromSupabase).mockResolvedValue({
        data: oldActivities
      });

      const result = await matchNewActivities();

      expect(result.success).toBe(true);
      expect(result.matched).toBe(0);
      expect(result.message).toBe('No activities in plan date range');
    });
  });
});
