import { describe, it, expect } from 'vitest';
import {
  updateDayCompletion,
  markDayAsMissed,
  unmatchDay,
  manuallyMatchDay,
  markDayCompletedManually,
  addNoteToDay,
  clearMissedStatus,
  batchUpdateDays
} from './planUpdater';

describe('planUpdater', () => {
  // Mock training plan
  const mockPlan = {
    meta: {
      plan_id: 'test-plan-123',
      plan_name: 'Test Training Plan',
      start_date: '2026-01-13'
    },
    periodization_overview: {
      macrocycle_goal: 'Complete 5K',
      phases: ['Base', 'Build']
    },
    schedule: [
      {
        week_number: 1,
        phase_name: 'Base',
        weekly_focus: 'Build aerobic foundation',
        days: [
          {
            day_name: 'Monday',
            day_index: 0,
            is_rest_day: false,
            is_completed: false,
            activity_category: 'RUN',
            activity_title: 'Easy Run',
            total_estimated_duration_min: 40,
            workout_structure: []
          },
          {
            day_name: 'Tuesday',
            day_index: 1,
            is_rest_day: true,
            is_completed: false,
            activity_category: 'REST'
          }
        ]
      },
      {
        week_number: 2,
        phase_name: 'Build',
        weekly_focus: 'Increase intensity',
        days: [
          {
            day_name: 'Monday',
            day_index: 0,
            is_rest_day: false,
            is_completed: false,
            activity_category: 'RUN',
            activity_title: 'Tempo Run',
            total_estimated_duration_min: 50
          }
        ]
      }
    ]
  };

  // ===================================================================
  // Suite 1: updateDayCompletion (5 tests)
  // ===================================================================
  describe('updateDayCompletion', () => {
    it('should mark day as completed with match data', () => {
      const matchData = {
        matched_activity_id: 12345,
        match_type: 'auto',
        match_confidence: 0.85,
        match_score: 0.87,
        completion_date: '2026-01-13'
      };

      const updatedPlan = updateDayCompletion(mockPlan, 0, 0, matchData);

      const day = updatedPlan.schedule[0].days[0];
      expect(day.is_completed).toBe(true);
      expect(day.matched_activity_id).toBe(12345);
      expect(day.match_type).toBe('auto');
      expect(day.match_confidence).toBe(0.85);
      expect(day.match_score).toBe(0.87);
      expect(day.completion_date).toBe('2026-01-13');
      expect(day.completion_type).toBe('matched');
    });

    it('should preserve other plan data (meta, periodization)', () => {
      const matchData = {
        matched_activity_id: 12345,
        match_type: 'auto'
      };

      const updatedPlan = updateDayCompletion(mockPlan, 0, 0, matchData);

      // Meta should be unchanged
      expect(updatedPlan.meta).toEqual(mockPlan.meta);
      expect(updatedPlan.periodization_overview).toEqual(mockPlan.periodization_overview);
    });

    it('should not mutate original plan (immutable update)', () => {
      const matchData = {
        matched_activity_id: 12345,
        match_type: 'auto'
      };

      const updatedPlan = updateDayCompletion(mockPlan, 0, 0, matchData);

      // Original plan should be unchanged
      expect(mockPlan.schedule[0].days[0].is_completed).toBe(false);
      expect(mockPlan.schedule[0].days[0].matched_activity_id).toBeUndefined();

      // Updated plan should have changes
      expect(updatedPlan.schedule[0].days[0].is_completed).toBe(true);
      expect(updatedPlan.schedule[0].days[0].matched_activity_id).toBe(12345);
    });

    it('should clear missed flag when marking as completed', () => {
      const planWithMissed = {
        ...mockPlan,
        schedule: [{
          ...mockPlan.schedule[0],
          days: [{
            ...mockPlan.schedule[0].days[0],
            is_missed: true,
            missed_reason: 'forgot'
          }]
        }]
      };

      const matchData = {
        matched_activity_id: 12345,
        match_type: 'auto'
      };

      const updatedPlan = updateDayCompletion(planWithMissed, 0, 0, matchData);

      expect(updatedPlan.schedule[0].days[0].is_missed).toBe(false);
      expect(updatedPlan.schedule[0].days[0].is_completed).toBe(true);
    });

    it('should throw error for invalid indices', () => {
      const matchData = { matched_activity_id: 12345 };

      expect(() => {
        updateDayCompletion(mockPlan, 99, 0, matchData);
      }).toThrow('Week 99 does not exist');

      expect(() => {
        updateDayCompletion(mockPlan, 0, 99, matchData);
      }).toThrow('Day 99 does not exist');
    });
  });

  // ===================================================================
  // Suite 2: markDayAsMissed (3 tests)
  // ===================================================================
  describe('markDayAsMissed', () => {
    it('should mark day as missed with reason', () => {
      const updatedPlan = markDayAsMissed(mockPlan, 0, 0, 'injury/illness');

      const day = updatedPlan.schedule[0].days[0];
      expect(day.is_missed).toBe(true);
      expect(day.missed_reason).toBe('injury/illness');
      expect(day.is_completed).toBe(false);
    });

    it('should mark as missed without reason', () => {
      const updatedPlan = markDayAsMissed(mockPlan, 0, 0);

      const day = updatedPlan.schedule[0].days[0];
      expect(day.is_missed).toBe(true);
      expect(day.missed_reason).toBeNull();
    });

    it('should not mutate original plan', () => {
      const updatedPlan = markDayAsMissed(mockPlan, 0, 0, 'forgot');

      expect(mockPlan.schedule[0].days[0].is_missed).toBeUndefined();
      expect(updatedPlan.schedule[0].days[0].is_missed).toBe(true);
    });
  });

  // ===================================================================
  // Suite 3: unmatchDay (3 tests)
  // ===================================================================
  describe('unmatchDay', () => {
    it('should clear all matching fields', () => {
      // Create a plan with matched day
      const planWithMatch = {
        ...mockPlan,
        schedule: [{
          ...mockPlan.schedule[0],
          days: [{
            ...mockPlan.schedule[0].days[0],
            is_completed: true,
            matched_activity_id: 12345,
            match_type: 'auto',
            match_confidence: 0.85,
            completion_date: '2026-01-13',
            completion_type: 'matched'
          }]
        }]
      };

      const updatedPlan = unmatchDay(planWithMatch, 0, 0);

      const day = updatedPlan.schedule[0].days[0];
      expect(day.is_completed).toBe(false);
      expect(day.matched_activity_id).toBeNull();
      expect(day.match_type).toBeNull();
      expect(day.match_confidence).toBeNull();
      expect(day.completion_date).toBeNull();
      expect(day.completion_type).toBeNull();
    });

    it('should clear missed flag when unmatching', () => {
      const planWithMissed = {
        ...mockPlan,
        schedule: [{
          ...mockPlan.schedule[0],
          days: [{
            ...mockPlan.schedule[0].days[0],
            is_missed: true,
            missed_reason: 'forgot'
          }]
        }]
      };

      const updatedPlan = unmatchDay(planWithMissed, 0, 0);

      expect(updatedPlan.schedule[0].days[0].is_missed).toBe(false);
    });

    it('should not mutate original plan', () => {
      const planWithMatch = {
        ...mockPlan,
        schedule: [{
          ...mockPlan.schedule[0],
          days: [{
            ...mockPlan.schedule[0].days[0],
            matched_activity_id: 12345
          }]
        }]
      };

      const updatedPlan = unmatchDay(planWithMatch, 0, 0);

      expect(planWithMatch.schedule[0].days[0].matched_activity_id).toBe(12345);
      expect(updatedPlan.schedule[0].days[0].matched_activity_id).toBeNull();
    });
  });

  // ===================================================================
  // Suite 4: manuallyMatchDay (2 tests)
  // ===================================================================
  describe('manuallyMatchDay', () => {
    it('should manually match day with activity', () => {
      const updatedPlan = manuallyMatchDay(mockPlan, 0, 0, 67890, '2026-01-13');

      const day = updatedPlan.schedule[0].days[0];
      expect(day.is_completed).toBe(true);
      expect(day.matched_activity_id).toBe(67890);
      expect(day.match_type).toBe('manual');
      expect(day.match_confidence).toBe(1.0);
      expect(day.completion_date).toBe('2026-01-13');
    });

    it('should use current date if no completion date provided', () => {
      const today = new Date().toISOString().split('T')[0];

      const updatedPlan = manuallyMatchDay(mockPlan, 0, 0, 67890);

      expect(updatedPlan.schedule[0].days[0].completion_date).toBe(today);
    });
  });

  // ===================================================================
  // Suite 5: markDayCompletedManually (2 tests)
  // ===================================================================
  describe('markDayCompletedManually', () => {
    it('should mark day as completed without activity match', () => {
      const updatedPlan = markDayCompletedManually(mockPlan, 0, 0, 'Did the workout but forgot to log on Strava');

      const day = updatedPlan.schedule[0].days[0];
      expect(day.is_completed).toBe(true);
      expect(day.matched_activity_id).toBeNull();
      expect(day.match_type).toBeNull();
      expect(day.completion_type).toBe('manual_checkbox');
      expect(day.user_notes).toBe('Did the workout but forgot to log on Strava');
    });

    it('should mark as completed without note', () => {
      const updatedPlan = markDayCompletedManually(mockPlan, 0, 0);

      const day = updatedPlan.schedule[0].days[0];
      expect(day.is_completed).toBe(true);
      expect(day.user_notes).toBeNull();
    });
  });

  // ===================================================================
  // Suite 6: addNoteToDay (2 tests)
  // ===================================================================
  describe('addNoteToDay', () => {
    it('should add note to day', () => {
      const updatedPlan = addNoteToDay(mockPlan, 0, 0, 'Felt great today!');

      expect(updatedPlan.schedule[0].days[0].user_notes).toBe('Felt great today!');
    });

    it('should not affect completion status', () => {
      const updatedPlan = addNoteToDay(mockPlan, 0, 0, 'Note');

      expect(updatedPlan.schedule[0].days[0].is_completed).toBe(false);
    });
  });

  // ===================================================================
  // Suite 7: clearMissedStatus (2 tests)
  // ===================================================================
  describe('clearMissedStatus', () => {
    it('should clear missed flag and reason', () => {
      const planWithMissed = {
        ...mockPlan,
        schedule: [{
          ...mockPlan.schedule[0],
          days: [{
            ...mockPlan.schedule[0].days[0],
            is_missed: true,
            missed_reason: 'injury/illness'
          }]
        }]
      };

      const updatedPlan = clearMissedStatus(planWithMissed, 0, 0);

      expect(updatedPlan.schedule[0].days[0].is_missed).toBe(false);
      expect(updatedPlan.schedule[0].days[0].missed_reason).toBeNull();
    });

    it('should not mutate original plan', () => {
      const planWithMissed = {
        ...mockPlan,
        schedule: [{
          ...mockPlan.schedule[0],
          days: [{
            ...mockPlan.schedule[0].days[0],
            is_missed: true
          }]
        }]
      };

      const updatedPlan = clearMissedStatus(planWithMissed, 0, 0);

      expect(planWithMissed.schedule[0].days[0].is_missed).toBe(true);
      expect(updatedPlan.schedule[0].days[0].is_missed).toBe(false);
    });
  });

  // ===================================================================
  // Suite 8: batchUpdateDays (2 tests)
  // ===================================================================
  describe('batchUpdateDays', () => {
    it('should apply multiple updates at once', () => {
      const updates = [
        {
          weekIndex: 0,
          dayIndex: 0,
          matchData: {
            matched_activity_id: 11111,
            match_type: 'auto'
          }
        },
        {
          weekIndex: 1,
          dayIndex: 0,
          matchData: {
            matched_activity_id: 22222,
            match_type: 'manual'
          }
        }
      ];

      const updatedPlan = batchUpdateDays(mockPlan, updates);

      expect(updatedPlan.schedule[0].days[0].matched_activity_id).toBe(11111);
      expect(updatedPlan.schedule[1].days[0].matched_activity_id).toBe(22222);
    });

    it('should handle empty updates array', () => {
      const updatedPlan = batchUpdateDays(mockPlan, []);

      // Should return plan with deep clone
      expect(updatedPlan).toEqual(mockPlan);
      expect(updatedPlan).not.toBe(mockPlan); // Different object reference
    });
  });

  // ===================================================================
  // Suite 9: Edge Cases & Error Handling (3 tests)
  // ===================================================================
  describe('Edge Cases', () => {
    it('should throw error for null plan', () => {
      expect(() => {
        updateDayCompletion(null, 0, 0, {});
      }).toThrow('Invalid plan structure');
    });

    it('should throw error for missing schedule', () => {
      const invalidPlan = {
        meta: { plan_id: 'test' }
        // No schedule
      };

      expect(() => {
        updateDayCompletion(invalidPlan, 0, 0, {});
      }).toThrow('Invalid plan structure');
    });

    it('should preserve nested workout_structure array', () => {
      const matchData = {
        matched_activity_id: 12345,
        match_type: 'auto'
      };

      const updatedPlan = updateDayCompletion(mockPlan, 0, 0, matchData);

      // workout_structure should still exist
      expect(updatedPlan.schedule[0].days[0].workout_structure).toEqual(
        mockPlan.schedule[0].days[0].workout_structure
      );
    });
  });
});
