import { describe, it, expect } from 'vitest';
import {
  classifyActivity,
  calculatePaceVariation,
  getRelativePace,
  getRelativeDistance,
  extractKeywords,
  calculateConfidence,
  WORKOUT_TYPES
} from './workoutClassifier';

describe('workoutClassifier', () => {
  // Mock athlete baseline
  const mockBaseline = {
    avgPace: 5.5, // 5:30 min/km
    longestDistance: 20, // 20 km
    avgDistance: 8, // 8 km
    avgRunsPerWeek: 4
  };

  // ===================================================================
  // Suite 1: Keyword-Based Classification (5 tests)
  // ===================================================================
  describe('Keyword-Based Classification', () => {
    it('should classify as INTERVAL when name contains "interval"', () => {
      const activity = {
        type: 'Run',
        name: 'Morning intervals',
        distance: 8000,
        moving_time: 2400,
        average_speed: 3.33
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.INTERVAL);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should classify as TEMPO when name contains "tempo"', () => {
      const activity = {
        type: 'Run',
        name: 'Tempo run',
        distance: 10000,
        moving_time: 3000,
        average_speed: 3.5
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.TEMPO);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should classify as LONG_RUN when name contains "long run"', () => {
      const activity = {
        type: 'Run',
        name: 'Long run Sunday',
        distance: 18000,
        moving_time: 6000,
        average_speed: 3.0
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.LONG_RUN);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should classify as RACE when name contains "race"', () => {
      const activity = {
        type: 'Run',
        name: 'Parkrun 5K race',
        distance: 5000,
        moving_time: 1200,
        average_speed: 4.17
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.RACE);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should classify as EASY_RUN when name contains "easy"', () => {
      const activity = {
        type: 'Run',
        name: 'Easy recovery run',
        distance: 6000,
        moving_time: 2100,
        average_speed: 2.86
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.EASY_RUN);
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  // ===================================================================
  // Suite 2: Pace-Based Classification (4 tests)
  // ===================================================================
  describe('Pace-Based Classification', () => {
    it('should classify as TEMPO when pace is much faster than average', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 10000,
        moving_time: 2700,
        average_speed: 3.7 // ~4:30 min/km (faster than 5:30 baseline)
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.TEMPO);
    });

    it('should classify as EASY_RUN when pace is slightly slower than average', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 8000,
        moving_time: 2900,
        average_speed: 2.76 // ~6:00 min/km (slower than 5:30 baseline)
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.EASY_RUN);
    });

    it('should classify short slow run as RECOVERY', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 3000,
        moving_time: 1200, // 20 minutes (< 25 min)
        average_speed: 2.5 // Slow pace
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.RECOVERY);
    });

    it('should handle missing pace data gracefully', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 8000,
        moving_time: 2400
        // No average_speed
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result).not.toBeNull();
      expect(result.type).toBeDefined();
      expect(result.signals.relativePace).toBeNull();
    });
  });

  // ===================================================================
  // Suite 3: Distance-Based Classification (3 tests)
  // ===================================================================
  describe('Distance-Based Classification', () => {
    it('should classify as LONG_RUN when distance is > 75% of longest', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 16000, // 16km (80% of 20km baseline)
        moving_time: 5400,
        average_speed: 2.96
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.LONG_RUN);
    });

    it('should classify as RECOVERY when distance is < 40% of average', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 3000, // 3km (37.5% of 8km baseline)
        moving_time: 1200, // 20 minutes (< 25 min threshold)
        average_speed: 2.5
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.RECOVERY);
    });

    it('should handle missing distance data gracefully', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        moving_time: 2400,
        average_speed: 3.0
        // No distance
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result).not.toBeNull();
      expect(result.signals.relativeDistance).toBeNull();
    });
  });

  // ===================================================================
  // Suite 4: Duration-Based Classification (2 tests)
  // ===================================================================
  describe('Duration-Based Classification', () => {
    it('should classify as LONG_RUN when duration > 90 minutes', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 15000,
        moving_time: 5700, // 95 minutes
        average_speed: 2.63
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.LONG_RUN);
    });

    it('should not override keyword classification based solely on duration', () => {
      const activity = {
        type: 'Run',
        name: 'Tempo run',
        distance: 10000,
        moving_time: 6000, // 100 minutes (very slow tempo)
        average_speed: 1.67
      };

      const result = classifyActivity(activity, mockBaseline);

      // Keyword should take precedence
      expect(result.type).toBe(WORKOUT_TYPES.TEMPO);
    });
  });

  // ===================================================================
  // Suite 5: Pace Variation Classification (2 tests)
  // ===================================================================
  describe('Pace Variation Classification', () => {
    it('should classify as INTERVAL when pace variation is high', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 8000,
        moving_time: 2400,
        average_speed: 3.33,
        raw_data: {
          splits_metric: [
            { distance: 1000, moving_time: 240 }, // 4:00/km
            { distance: 1000, moving_time: 360 }, // 6:00/km (recovery)
            { distance: 1000, moving_time: 240 }, // 4:00/km
            { distance: 1000, moving_time: 360 }, // 6:00/km (recovery)
            { distance: 1000, moving_time: 240 }, // 4:00/km
            { distance: 1000, moving_time: 360 }, // 6:00/km (recovery)
            { distance: 1000, moving_time: 240 }, // 4:00/km
            { distance: 1000, moving_time: 360 }  // 6:00/km (recovery)
          ]
        }
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.type).toBe(WORKOUT_TYPES.INTERVAL);
      expect(result.signals.paceVariation).toBeGreaterThan(0.15);
    });

    it('should handle missing split data', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 8000,
        moving_time: 2400,
        average_speed: 3.33
        // No raw_data or splits
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.signals.paceVariation).toBeNull();
      expect(result.type).toBeDefined(); // Should still classify
    });
  });

  // ===================================================================
  // Suite 6: Confidence Calculation (4 tests)
  // ===================================================================
  describe('Confidence Calculation', () => {
    it('should have high confidence with all signals available', () => {
      const activity = {
        type: 'Run',
        name: 'Tempo run',
        distance: 10000,
        moving_time: 3000,
        average_speed: 3.5,
        has_heartrate: true,
        average_heartrate: 160,
        average_cadence: 180,
        raw_data: {
          splits_metric: [
            { distance: 1000, moving_time: 300 },
            { distance: 1000, moving_time: 300 }
          ]
        }
      };

      const result = classifyActivity(activity, mockBaseline);

      // Should have high confidence: pace + HR + cadence + splits + keyword
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should have medium confidence with pace data only', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 8000,
        moving_time: 2400,
        average_speed: 3.0
        // Only basic data, no HR, no splits
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should have lower confidence with minimal data', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 8000,
        moving_time: 2400
        // No pace, no HR, no splits
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should penalize conflicting signals', () => {
      const activity = {
        type: 'Run',
        name: 'Run',
        distance: 19000, // Very long distance (95% of longest)
        moving_time: 4200,
        average_speed: 4.5 // Very fast pace
        // Conflicting: fast pace + long distance (unusual combination)
      };

      const result = classifyActivity(activity, mockBaseline);

      // Should have reduced confidence due to conflicting signals
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  // ===================================================================
  // Suite 7: Edge Cases (3 tests)
  // ===================================================================
  describe('Edge Cases', () => {
    it('should return null for non-run activities', () => {
      const activity = {
        type: 'Ride',
        name: 'Bike ride',
        distance: 30000,
        moving_time: 3600,
        average_speed: 8.33
      };

      const result = classifyActivity(activity, mockBaseline);

      expect(result).toBeNull();
    });

    it('should handle null/undefined activity', () => {
      const result = classifyActivity(null, mockBaseline);

      expect(result).toBeNull();
    });

    it('should handle missing athlete baseline gracefully', () => {
      const activity = {
        type: 'Run',
        name: 'Easy run',
        distance: 8000,
        moving_time: 2400,
        average_speed: 3.0
      };

      const result = classifyActivity(activity, null);

      expect(result).not.toBeNull();
      expect(result.type).toBeDefined();
      expect(result.signals.relativePace).toBeNull();
      expect(result.signals.relativeDistance).toBeNull();
    });
  });

  // ===================================================================
  // Suite 8: Helper Function Tests (3 tests)
  // ===================================================================
  describe('Helper Functions', () => {
    it('calculatePaceVariation should calculate coefficient of variation', () => {
      const activity = {
        raw_data: {
          splits_metric: [
            { distance: 1000, moving_time: 300 },
            { distance: 1000, moving_time: 300 },
            { distance: 1000, moving_time: 300 }
          ]
        }
      };

      const cv = calculatePaceVariation(activity);

      expect(cv).toBe(0); // All same pace = no variation
    });

    it('getRelativePace should calculate pace ratio correctly', () => {
      const activity = {
        average_speed: 3.636 // ~4:35 min/km
      };

      const ratio = getRelativePace(activity, mockBaseline);

      // 4:35 / 5:30 ≈ 0.83 (faster than baseline)
      expect(ratio).toBeCloseTo(0.83, 1);
    });

    it('extractKeywords should detect multiple keyword patterns', () => {
      const keywords = extractKeywords('Interval training with 400m repeats');

      expect(keywords.interval).toBe(true);
      expect(keywords.tempo).toBe(false);
      expect(keywords.longRun).toBe(false);
    });
  });
});
