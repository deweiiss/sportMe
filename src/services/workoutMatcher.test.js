import { describe, it, expect } from 'vitest';
import {
  matchActivityToPlan,
  findCandidateWorkouts,
  calculateDayDate,
  calculateDateScore,
  calculateTypeScore,
  calculateDurationScore,
  calculateIntensityScore,
  inferPlannedWorkoutType,
  getConfidenceLevel,
  detectMissedWorkouts,
  CONFIDENCE_LEVELS
} from './workoutMatcher';
import { WORKOUT_TYPES } from './workoutClassifier';

describe('workoutMatcher', () => {
  // Mock athlete baseline
  const mockBaseline = {
    avgPace: 5.5,
    longestDistance: 20,
    avgDistance: 8,
    avgRunsPerWeek: 4
  };

  // Mock training plan
  const mockPlan = {
    meta: {
      start_date: '2026-01-13' // Monday
    },
    schedule: [
      {
        week_number: 1,
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
              { segment_type: 'WARMUP', intensity_zone: 1 },
              { segment_type: 'MAIN', intensity_zone: 2 },
              { segment_type: 'COOLDOWN', intensity_zone: 1 }
            ]
          },
          {
            day_name: 'Tuesday',
            day_index: 1,
            is_rest_day: true,
            is_completed: false,
            activity_category: 'REST'
          },
          {
            day_name: 'Wednesday',
            day_index: 2,
            is_rest_day: false,
            is_completed: false,
            activity_category: 'RUN',
            activity_title: 'Tempo Run',
            total_estimated_duration_min: 50,
            workout_structure: [
              { segment_type: 'WARMUP', intensity_zone: 2 },
              { segment_type: 'MAIN', intensity_zone: 4 },
              { segment_type: 'COOLDOWN', intensity_zone: 2 }
            ]
          },
          {
            day_name: 'Thursday',
            day_index: 3,
            is_rest_day: true,
            is_completed: false,
            activity_category: 'REST'
          },
          {
            day_name: 'Friday',
            day_index: 4,
            is_rest_day: false,
            is_completed: false,
            activity_category: 'RUN',
            activity_title: 'Interval Training',
            total_estimated_duration_min: 60,
            workout_structure: [
              { segment_type: 'WARMUP', intensity_zone: 2 },
              { segment_type: 'INTERVAL', intensity_zone: 5 },
              { segment_type: 'RECOVERY', intensity_zone: 2 },
              { segment_type: 'COOLDOWN', intensity_zone: 1 }
            ]
          }
        ]
      }
    ]
  };

  // ===================================================================
  // Suite 1: Date Score Calculation (5 tests)
  // ===================================================================
  describe('calculateDateScore', () => {
    it('should return 1.0 for same day', () => {
      const date1 = new Date('2026-01-13T08:00:00Z');
      const date2 = new Date('2026-01-13T10:00:00Z');

      const score = calculateDateScore(date1, date2);

      expect(score).toBe(1.0);
    });

    it('should return 0.8 for ±1 day', () => {
      const date1 = new Date('2026-01-13T08:00:00Z');
      const date2 = new Date('2026-01-14T08:00:00Z');

      const score = calculateDateScore(date1, date2);

      expect(score).toBe(0.8);
    });

    it('should return 0.6 for ±2 days', () => {
      const date1 = new Date('2026-01-13T08:00:00Z');
      const date2 = new Date('2026-01-15T08:00:00Z');

      const score = calculateDateScore(date1, date2);

      expect(score).toBe(0.6);
    });

    it('should return lower score for same week but different order', () => {
      const date1 = new Date('2026-01-13T08:00:00Z'); // Monday
      const date2 = new Date('2026-01-17T08:00:00Z'); // Friday

      const score = calculateDateScore(date1, date2);

      expect(score).toBeGreaterThan(0.2);
      expect(score).toBeLessThan(0.5);
    });

    it('should return 0.0 for more than 1 week apart', () => {
      const date1 = new Date('2026-01-13T08:00:00Z');
      const date2 = new Date('2026-01-22T08:00:00Z'); // 9 days apart

      const score = calculateDateScore(date1, date2);

      expect(score).toBe(0.0);
    });
  });

  // ===================================================================
  // Suite 2: Type Score Calculation (6 tests)
  // ===================================================================
  describe('calculateTypeScore', () => {
    it('should return 1.0 for exact type match', () => {
      const score = calculateTypeScore(WORKOUT_TYPES.TEMPO, WORKOUT_TYPES.TEMPO);

      expect(score).toBe(1.0);
    });

    it('should return 0.6 for INTERVAL-TEMPO compatibility', () => {
      const score = calculateTypeScore(WORKOUT_TYPES.INTERVAL, WORKOUT_TYPES.TEMPO);

      expect(score).toBe(0.6);
    });

    it('should return 0.8 for EASY_RUN-RECOVERY compatibility', () => {
      const score = calculateTypeScore(WORKOUT_TYPES.EASY_RUN, WORKOUT_TYPES.RECOVERY);

      expect(score).toBe(0.8);
    });

    it('should return 0.5 for LONG_RUN-EASY_RUN compatibility', () => {
      const score = calculateTypeScore(WORKOUT_TYPES.LONG_RUN, WORKOUT_TYPES.EASY_RUN);

      expect(score).toBe(0.5);
    });

    it('should return 0.7 for RACE-TEMPO compatibility', () => {
      const score = calculateTypeScore(WORKOUT_TYPES.RACE, WORKOUT_TYPES.TEMPO);

      expect(score).toBe(0.7);
    });

    it('should return 0.2 for incompatible types', () => {
      const score = calculateTypeScore(WORKOUT_TYPES.RECOVERY, WORKOUT_TYPES.TEMPO);

      expect(score).toBe(0.2);
    });
  });

  // ===================================================================
  // Suite 3: Duration Score Calculation (4 tests)
  // ===================================================================
  describe('calculateDurationScore', () => {
    it('should return 1.0 for duration within 10%', () => {
      const activity = { moving_time: 2400 }; // 40 minutes
      const plannedDay = { total_estimated_duration_min: 42 }; // 42 minutes (5% diff)

      const score = calculateDurationScore(activity, plannedDay);

      expect(score).toBe(1.0);
    });

    it('should return 0.8 for duration within 25%', () => {
      const activity = { moving_time: 2400 }; // 40 minutes
      const plannedDay = { total_estimated_duration_min: 48 }; // 48 minutes (20% diff)

      const score = calculateDurationScore(activity, plannedDay);

      expect(score).toBe(0.8);
    });

    it('should return 0.5 for duration within 50%', () => {
      const activity = { moving_time: 2400 }; // 40 minutes
      const plannedDay = { total_estimated_duration_min: 55 }; // 55 minutes (37.5% diff)

      const score = calculateDurationScore(activity, plannedDay);

      expect(score).toBe(0.5);
    });

    it('should return 0.2 for duration > 50% off', () => {
      const activity = { moving_time: 2400 }; // 40 minutes
      const plannedDay = { total_estimated_duration_min: 80 }; // 80 minutes (100% diff)

      const score = calculateDurationScore(activity, plannedDay);

      expect(score).toBe(0.2);
    });
  });

  // ===================================================================
  // Suite 4: Intensity Score Calculation (3 tests)
  // ===================================================================
  describe('calculateIntensityScore', () => {
    it('should return 1.0 for exact zone match', () => {
      const activity = { average_heartrate: 150, has_heartrate: true }; // Zone 2 (~145-155)
      const plannedDay = {
        workout_structure: [
          { segment_type: 'MAIN', intensity_zone: 2 },
          { segment_type: 'MAIN', intensity_zone: 2 }
        ]
      };

      const score = calculateIntensityScore(activity, plannedDay);

      expect(score).toBe(1.0);
    });

    it('should return 0.7 for ±1 zone difference', () => {
      const activity = { average_heartrate: 160, has_heartrate: true }; // Zone 3
      const plannedDay = {
        workout_structure: [
          { segment_type: 'MAIN', intensity_zone: 2 }
        ]
      };

      const score = calculateIntensityScore(activity, plannedDay);

      expect(score).toBe(0.7);
    });

    it('should return 0.5 if no HR data available', () => {
      const activity = { average_speed: 3.0 }; // No HR data
      const plannedDay = {
        workout_structure: [
          { segment_type: 'MAIN', intensity_zone: 2 }
        ]
      };

      const score = calculateIntensityScore(activity, plannedDay);

      expect(score).toBe(0.5);
    });
  });

  // ===================================================================
  // Suite 5: Planned Workout Type Inference (4 tests)
  // ===================================================================
  describe('inferPlannedWorkoutType', () => {
    it('should infer INTERVAL from INTERVAL segment', () => {
      const structure = [
        { segment_type: 'WARMUP', intensity_zone: 2 },
        { segment_type: 'INTERVAL', intensity_zone: 5 },
        { segment_type: 'COOLDOWN', intensity_zone: 1 }
      ];

      const type = inferPlannedWorkoutType(structure);

      expect(type).toBe(WORKOUT_TYPES.INTERVAL);
    });

    it('should infer TEMPO from Zone 4+ main segment', () => {
      const structure = [
        { segment_type: 'WARMUP', intensity_zone: 2 },
        { segment_type: 'MAIN', intensity_zone: 4 },
        { segment_type: 'COOLDOWN', intensity_zone: 2 }
      ];

      const type = inferPlannedWorkoutType(structure);

      expect(type).toBe(WORKOUT_TYPES.TEMPO);
    });

    it('should infer RECOVERY from Zone 1 main segment', () => {
      const structure = [
        { segment_type: 'MAIN', intensity_zone: 1 }
      ];

      const type = inferPlannedWorkoutType(structure);

      expect(type).toBe(WORKOUT_TYPES.RECOVERY);
    });

    it('should infer LONG_RUN from long duration', () => {
      const structure = [
        { segment_type: 'MAIN', intensity_zone: 2, duration_value: 95 }
      ];

      const type = inferPlannedWorkoutType(structure);

      expect(type).toBe(WORKOUT_TYPES.LONG_RUN);
    });
  });

  // ===================================================================
  // Suite 6: Confidence Levels (3 tests)
  // ===================================================================
  describe('getConfidenceLevel', () => {
    it('should return "high" for score >= 0.75', () => {
      expect(getConfidenceLevel(0.75)).toBe('high');
      expect(getConfidenceLevel(0.85)).toBe('high');
      expect(getConfidenceLevel(1.0)).toBe('high');
    });

    it('should return "medium" for score 0.50-0.74', () => {
      expect(getConfidenceLevel(0.50)).toBe('medium');
      expect(getConfidenceLevel(0.65)).toBe('medium');
      expect(getConfidenceLevel(0.74)).toBe('medium');
    });

    it('should return "low" for score < 0.50', () => {
      expect(getConfidenceLevel(0.49)).toBe('low');
      expect(getConfidenceLevel(0.25)).toBe('low');
      expect(getConfidenceLevel(0.0)).toBe('low');
    });
  });

  // ===================================================================
  // Suite 7: Day Date Calculation (3 tests)
  // ===================================================================
  describe('calculateDayDate', () => {
    const planStart = new Date('2026-01-13'); // Monday

    it('should calculate correct date for Week 1, Day 0', () => {
      const date = calculateDayDate(planStart, 0, 0);

      expect(date.toISOString().split('T')[0]).toBe('2026-01-13');
    });

    it('should calculate correct date for Week 1, Day 4 (Friday)', () => {
      const date = calculateDayDate(planStart, 0, 4);

      expect(date.toISOString().split('T')[0]).toBe('2026-01-17');
    });

    it('should calculate correct date for Week 2, Day 0', () => {
      const date = calculateDayDate(planStart, 1, 0);

      // Week 1 ends Sunday (Jan 18), Week 2 starts Monday (Jan 19)
      expect(date.toISOString().split('T')[0]).toBe('2026-01-19');
    });
  });

  // ===================================================================
  // Suite 8: Candidate Workout Finding (2 tests)
  // ===================================================================
  describe('findCandidateWorkouts', () => {
    it('should find workouts within ±7 days', () => {
      const activityDate = new Date('2026-01-15'); // Wednesday

      const candidates = findCandidateWorkouts(mockPlan, activityDate);

      // Should find Monday (Jan 13), Wednesday (Jan 15), Friday (Jan 17)
      // All within 7 days
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.every(c => !c.day.is_rest_day)).toBe(true);
    });

    it('should exclude already matched workouts', () => {
      const planWithMatch = {
        ...mockPlan,
        schedule: [{
          ...mockPlan.schedule[0],
          days: mockPlan.schedule[0].days.map((day, idx) =>
            idx === 0 ? { ...day, matched_activity_id: 12345 } : day
          )
        }]
      };

      const activityDate = new Date('2026-01-13'); // Monday

      const candidates = findCandidateWorkouts(planWithMatch, activityDate);

      // Should not include Monday (already matched)
      expect(candidates.some(c => c.dayIndex === 0)).toBe(false);
    });
  });

  // ===================================================================
  // Suite 9: Missed Workout Detection (3 tests)
  // ===================================================================
  describe('detectMissedWorkouts', () => {
    it('should detect missed workouts after grace period', () => {
      // Create a plan that started 10 days ago
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const planWithPastWorkouts = {
        meta: { start_date: pastDate.toISOString().split('T')[0] },
        schedule: [
          {
            week_number: 1,
            days: [
              {
                day_name: 'Monday',
                day_index: 0,
                is_rest_day: false,
                is_completed: false,
                activity_category: 'RUN',
                total_estimated_duration_min: 40
              }
            ]
          }
        ]
      };

      const missed = detectMissedWorkouts(planWithPastWorkouts, 3);

      expect(missed.length).toBe(1);
      expect(missed[0].daysPastDue).toBeGreaterThan(3);
    });

    it('should not detect workouts within grace period', () => {
      // Create a plan that started 2 days ago
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 2);

      const planWithRecentWorkouts = {
        meta: { start_date: recentDate.toISOString().split('T')[0] },
        schedule: [
          {
            week_number: 1,
            days: [
              {
                day_name: 'Monday',
                day_index: 0,
                is_rest_day: false,
                is_completed: false,
                activity_category: 'RUN'
              }
            ]
          }
        ]
      };

      const missed = detectMissedWorkouts(planWithRecentWorkouts, 3);

      expect(missed.length).toBe(0);
    });

    it('should not detect completed or rest day workouts', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10);

      const plan = {
        meta: { start_date: pastDate.toISOString().split('T')[0] },
        schedule: [
          {
            week_number: 1,
            days: [
              {
                day_name: 'Monday',
                day_index: 0,
                is_rest_day: false,
                is_completed: true, // Completed
                activity_category: 'RUN'
              },
              {
                day_name: 'Tuesday',
                day_index: 1,
                is_rest_day: true, // Rest day
                activity_category: 'REST'
              }
            ]
          }
        ]
      };

      const missed = detectMissedWorkouts(plan, 3);

      expect(missed.length).toBe(0);
    });
  });

  // ===================================================================
  // Suite 10: Full Matching Integration (2 tests)
  // ===================================================================
  describe('matchActivityToPlan', () => {
    it('should return high confidence match for same-day tempo run', () => {
      const activity = {
        type: 'Run',
        name: 'Tempo run',
        start_date_local: '2026-01-15T08:00:00Z', // Wednesday
        distance: 10000,
        moving_time: 3000, // 50 minutes
        average_speed: 3.5,
        has_heartrate: true,
        average_heartrate: 165
      };

      const result = matchActivityToPlan(activity, mockPlan, mockBaseline);

      expect(result.bestMatch).not.toBeNull();
      expect(result.bestMatch.confidence).toBe('high');
      expect(result.bestMatch.day.activity_title).toBe('Tempo Run');
    });

    it('should return empty matches for non-run activity', () => {
      const activity = {
        type: 'Ride',
        name: 'Bike ride',
        start_date_local: '2026-01-13T08:00:00Z',
        distance: 30000,
        moving_time: 3600
      };

      const result = matchActivityToPlan(activity, mockPlan, mockBaseline);

      expect(result.matches).toEqual([]);
      expect(result.bestMatch).toBeNull();
    });
  });
});
