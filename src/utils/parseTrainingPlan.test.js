import { describe, it, expect, vi } from 'vitest';
import { parseFlattenedTrainingPlan } from './parseTrainingPlan';

describe('parseFlattenedTrainingPlan', () => {
  describe('String format parsing (flattened)', () => {
    it('should parse a simple rest day string', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Recovery',
            days: [
              'Monday|0|true|false|REST|Rest Day|0|'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);

      expect(result.schedule[0].days[0]).toEqual({
        day_name: 'Monday',
        day_index: 0,
        is_rest_day: true,
        is_completed: false,
        activity_category: 'REST',
        activity_title: 'Rest Day',
        total_estimated_duration_min: 0,
        workout_structure: []
      });
    });

    it('should parse an easy run with 3 segments (WARMUP||MAIN||COOLDOWN)', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Build aerobic base',
            days: [
              'Tuesday|1|false|false|RUN|Easy Run|40|WARMUP:Easy jog,5 min,Zone 1||MAIN:Steady run,30 min,Zone 2||COOLDOWN:Walk,5 min,Zone 1'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      expect(day.day_name).toBe('Tuesday');
      expect(day.activity_category).toBe('RUN');
      expect(day.workout_structure).toHaveLength(3);

      // Check WARMUP
      expect(day.workout_structure[0]).toEqual({
        segment_type: 'WARMUP',
        description: 'Easy jog',
        duration_value: 5,
        duration_unit: 'min',
        intensity_zone: 1
      });

      // Check MAIN
      expect(day.workout_structure[1]).toEqual({
        segment_type: 'MAIN',
        description: 'Steady run',
        duration_value: 30,
        duration_unit: 'min',
        intensity_zone: 2
      });

      // Check COOLDOWN
      expect(day.workout_structure[2]).toEqual({
        segment_type: 'COOLDOWN',
        description: 'Walk',
        duration_value: 5,
        duration_unit: 'min',
        intensity_zone: 1
      });
    });

    it('should parse a tempo run with segments', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Build',
            weekly_focus: 'Tempo work',
            days: [
              'Wednesday|2|false|false|RUN|Tempo Run|50|WARMUP:Jog,10 min,Zone 2||MAIN:Tempo pace,30 min,Zone 4||COOLDOWN:Jog,10 min,Zone 2'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      expect(day.workout_structure).toHaveLength(3);
      expect(day.workout_structure[1].segment_type).toBe('MAIN');
      expect(day.workout_structure[1].intensity_zone).toBe(4);
    });

    it('should parse interval workout with multiple segments', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Peak',
            weekly_focus: 'Speed work',
            days: [
              'Thursday|3|false|false|RUN|Intervals|45|WARMUP:Jog,10 min,Zone 2||INTERVAL:Fast,3 min,Zone 5||RECOVERY:Jog,2 min,Zone 1||INTERVAL:Fast,3 min,Zone 5||RECOVERY:Jog,2 min,Zone 1||COOLDOWN:Jog,10 min,Zone 2'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      expect(day.workout_structure).toHaveLength(6);
      expect(day.workout_structure[0].segment_type).toBe('WARMUP');
      expect(day.workout_structure[1].segment_type).toBe('INTERVAL');
      expect(day.workout_structure[2].segment_type).toBe('RECOVERY');
      expect(day.workout_structure[3].segment_type).toBe('INTERVAL');
      expect(day.workout_structure[4].segment_type).toBe('RECOVERY');
      expect(day.workout_structure[5].segment_type).toBe('COOLDOWN');
    });

    it('should handle distance-based segments (km)', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Long run',
            days: [
              'Sunday|6|false|false|RUN|Long Run|90|WARMUP:Easy,1 km,Zone 1||MAIN:Steady,15 km,Zone 2||COOLDOWN:Walk,1 km,Zone 1'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      expect(day.workout_structure[1].duration_value).toBe(15);
      expect(day.workout_structure[1].duration_unit).toBe('km');
    });
  });

  describe('Object format parsing (already structured)', () => {
    it('should handle days that are already objects with workout_structure', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Build',
            days: [
              {
                day_name: 'Tuesday',
                day_index: 1,
                is_rest_day: false,
                is_completed: false,
                activity_category: 'RUN',
                activity_title: 'Easy Run',
                total_estimated_duration_min: 40,
                workout_structure: [
                  {
                    segment_type: 'WARMUP',
                    description: 'Easy jog',
                    duration_value: 5,
                    duration_unit: 'min',
                    intensity_zone: 1
                  },
                  {
                    segment_type: 'MAIN',
                    description: 'Steady run',
                    duration_value: 30,
                    duration_unit: 'min',
                    intensity_zone: 2
                  },
                  {
                    segment_type: 'COOLDOWN',
                    description: 'Walk',
                    duration_value: 5,
                    duration_unit: 'min',
                    intensity_zone: 1
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      expect(day.workout_structure).toHaveLength(3);
      expect(day.workout_structure[0].segment_type).toBe('WARMUP');
      expect(day.workout_structure[1].segment_type).toBe('MAIN');
      expect(day.workout_structure[2].segment_type).toBe('COOLDOWN');
    });

    it('should handle days with alternative field names (workouts, segments)', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Build',
            days: [
              {
                day_name: 'Tuesday',
                day_index: 1,
                is_rest_day: false,
                is_completed: false,
                activity_category: 'RUN',
                activity_title: 'Easy Run',
                total_estimated_duration_min: 40,
                workouts: [
                  {
                    segment_type: 'WARMUP',
                    description: 'Easy jog',
                    duration_value: 5,
                    duration_unit: 'min',
                    intensity_zone: 1
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      expect(day.workout_structure).toHaveLength(1);
      expect(day.workout_structure[0].segment_type).toBe('WARMUP');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing || separator and warn', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Build',
            days: [
              // Missing || separator - single segment only
              'Tuesday|1|false|false|RUN|Easy Run|40|WARMUP:Easy jog,5 min,Zone 1'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      // Should still parse the single segment
      expect(day.workout_structure).toHaveLength(1);
      expect(day.workout_structure[0].segment_type).toBe('WARMUP');

      // Should have logged warning about missing ||
      // console.warn is called with multiple arguments, so check the first call's first argument
      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('RUN workout has segments but missing || separator!');

      consoleWarnSpy.mockRestore();
    });

    it('should handle invalid segment format gracefully', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Build',
            days: [
              'Tuesday|1|false|false|RUN|Easy Run|40|INVALID_SEGMENT_FORMAT'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      // Should return empty workout_structure for invalid format
      expect(day.workout_structure).toHaveLength(0);
    });

    it('should handle empty segments string', () => {
      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Recovery',
            days: [
              'Monday|0|true|false|REST|Rest Day|0|'
            ]
          }
        ]
      };

      const result = parseFlattenedTrainingPlan(input);
      const day = result.schedule[0].days[0];

      expect(day.workout_structure).toHaveLength(0);
    });

    it('should handle RUN workouts with less than 3 segments and warn', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const input = {
        meta: {
          plan_name: 'Test Plan',
          start_date: '2025-01-08'
        },
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base',
            weekly_focus: 'Build',
            days: [
              {
                day_name: 'Tuesday',
                day_index: 1,
                is_rest_day: false,
                is_completed: false,
                activity_category: 'RUN',
                activity_title: 'Easy Run',
                total_estimated_duration_min: 40,
                workout_structure: [
                  {
                    segment_type: 'MAIN',
                    description: 'Run',
                    duration_value: 30,
                    duration_unit: 'min',
                    intensity_zone: 2
                  }
                ]
              }
            ]
          }
        ]
      };

      parseFlattenedTrainingPlan(input);

      // Should warn about insufficient segments for RUN workout
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('RUN workout has only 1 segments')
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
