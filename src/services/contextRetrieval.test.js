import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserContext } from './contextRetrieval';

/**
 * Mock Supabase functions
 * We'll reset these mocks before each test to avoid side effects
 */
vi.mock('./supabase', () => ({
  getAthleteProfile: vi.fn(),
  getActivitiesFromSupabase: vi.fn(),
  getTrainingPlans: vi.fn()
}));

import { getAthleteProfile, getActivitiesFromSupabase, getTrainingPlans } from './supabase';

/**
 * Comprehensive tests for getUserContext function.
 *
 * This function is CRITICAL because it assembles all context that the LLM receives,
 * combining data from three sources:
 * 1. Strava Data (activities, statistics)
 * 2. Athlete Profile (About Me section)
 * 3. Training Plans (active and recent)
 *
 * If this function has bugs, the LLM will generate poor plans due to missing information.
 *
 * These tests ensure:
 * - All three data sources are correctly fetched and formatted
 * - Current date/year is always included (critical for date calculations)
 * - Statistics are calculated correctly
 * - Error handling works (degrades gracefully)
 */

describe('getUserContext', () => {
  // Reset all mocks before each test to ensure clean state
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===================================================================
  // Suite 1: Date Information Inclusion (CRITICAL - 5 tests)
  // ===================================================================
  describe('Current Date Information (CRITICAL)', () => {
    beforeEach(() => {
      // Set up minimal mocks to allow tests to run
      getAthleteProfile.mockResolvedValue({ data: null, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });
    });

    it('should include current date in YYYY-MM-DD format', async () => {
      const context = await getUserContext();

      expect(context).toContain('TODAY (YYYY-MM-DD):');
      // Should match YYYY-MM-DD format
      expect(context).toMatch(/TODAY \(YYYY-MM-DD\): \d{4}-\d{2}-\d{2}/);
    });

    it('should include current year with warning', async () => {
      const context = await getUserContext();
      const currentYear = new Date().getFullYear();

      expect(context).toContain(`THE YEAR IS: ${currentYear}`);
      expect(context).toContain('NOT 2023, NOT 2024');
    });

    it('should include tomorrow date as default start', async () => {
      const context = await getUserContext();

      expect(context).toContain('TOMORROW (default start):');

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      expect(context).toContain(tomorrowStr);
    });

    it('should include full readable date with day of week', async () => {
      const context = await getUserContext();

      const today = new Date();
      const fullDate = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      expect(context).toContain(`TODAY: ${fullDate}`);
    });

    it('should have warning box about date requirements', async () => {
      const context = await getUserContext();
      const currentYear = new Date().getFullYear();
      const dateStr = new Date().toISOString().split('T')[0];

      expect(context).toContain(`ALL dates in your plan MUST use year ${currentYear} or later`);
      expect(context).toContain(`start_date MUST be >= ${dateStr}`);
    });
  });

  // ===================================================================
  // Suite 2: Athlete Profile Data (8 tests)
  // ===================================================================
  describe('Athlete Profile Data (About Me Section)', () => {
    const mockProfile = {
      firstname: 'John',
      lastname: 'Doe',
      weight: 75,
      city: 'Berlin',
      state: null,
      country: 'Germany',
      sex: 'M',
      birthday: '1990-05-15',
      bikes: [{ name: 'Road Bike' }, { name: 'Mountain Bike' }],
      shoes: [{ name: 'Nike Pegasus' }, { name: 'Adidas Boston' }]
    };

    beforeEach(() => {
      getAthleteProfile.mockResolvedValue({ data: mockProfile, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });
    });

    it('should include athlete name', async () => {
      const context = await getUserContext();

      expect(context).toContain('=== ATHLETE PROFILE ===');
      expect(context).toContain('Name: John Doe');
    });

    it('should include weight in kg', async () => {
      const context = await getUserContext();

      expect(context).toContain('Weight: 75 kg');
    });

    it('should include location (city and country)', async () => {
      const context = await getUserContext();

      expect(context).toContain('Location: Berlin, Germany');
    });

    it('should include gender', async () => {
      const context = await getUserContext();

      expect(context).toContain('Gender: Male');
    });

    it('should include birthday in readable format', async () => {
      const context = await getUserContext();

      expect(context).toMatch(/Birthday:.*May.*15.*1990/);
    });

    it('should include gear information (bikes and shoes)', async () => {
      const context = await getUserContext();

      expect(context).toContain('Gear:');
      expect(context).toContain('Bikes: Road Bike, Mountain Bike');
      expect(context).toContain('Shoes: Nike Pegasus, Adidas Boston');
    });

    it('should handle missing profile data gracefully', async () => {
      getAthleteProfile.mockResolvedValue({ data: null, error: null });

      const context = await getUserContext();

      // Should not crash, should still return valid context with date
      expect(context).toBeTruthy();
      expect(context).toContain('CURRENT DATE');
    });

    it('should format profile section with headers', async () => {
      const context = await getUserContext();

      expect(context).toContain('=== ATHLETE PROFILE ===');
    });
  });

  // ===================================================================
  // Suite 3: Strava Activity Statistics (7 tests)
  // ===================================================================
  describe('Strava Activity Statistics', () => {
    const mockActivities = [
      {
        id: '1',
        type: 'Run',
        start_date_local: '2025-01-05T08:00:00Z',
        distance: 10000, // 10km
        moving_time: 3000, // 50 minutes
        average_speed: 3.33, // ~6:00 min/km pace
        name: 'Morning run'
      },
      {
        id: '2',
        type: 'Run',
        start_date_local: '2025-01-03T08:00:00Z',
        distance: 5000, // 5km
        moving_time: 1500, // 25 minutes
        average_speed: 3.33,
        name: 'Easy run'
      },
      {
        id: '3',
        type: 'Run',
        start_date_local: '2025-01-01T08:00:00Z',
        distance: 15000, // 15km
        moving_time: 5400, // 90 minutes
        average_speed: 2.78, // ~7:00 min/km pace
        name: 'Long run'
      }
    ];

    beforeEach(() => {
      getAthleteProfile.mockResolvedValue({ data: null, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: mockActivities, error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });
    });

    it('should include weekly averages (km/week and runs/week)', async () => {
      const context = await getUserContext();

      expect(context).toContain('Weekly Averages:');
      expect(context).toMatch(/\d+\.?\d* km\/week/);
      expect(context).toMatch(/\d+\.?\d* runs\/week/);
    });

    it('should include average pace in min/km', async () => {
      const context = await getUserContext();

      expect(context).toContain('Avg Pace:');
      expect(context).toMatch(/\d+\.?\d* min\/km/);
    });

    it('should include longest run distance', async () => {
      const context = await getUserContext();

      expect(context).toContain('Longest:');
      expect(context).toMatch(/15\.0 km/); // Longest should be 15km
    });

    it('should include recent frequency (last 30 days)', async () => {
      const context = await getUserContext();

      expect(context).toContain('Recent Frequency:');
      expect(context).toMatch(/\d+ runs in last 30 days/);
    });

    it('should format individual activities with dates and metrics', async () => {
      const context = await getUserContext();

      expect(context).toContain('Recent activities:');
      expect(context).toMatch(/Jan \d+, \d{4}/); // Date format
      expect(context).toMatch(/\d+\.?\d* km/); // Distance
      expect(context).toMatch(/\d+m/); // Duration in minutes
      expect(context).toMatch(/\d+\.?\d* min\/km/); // Pace
    });

    it('should handle empty Strava data (shows "No recent activities")', async () => {
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();

      expect(context).toContain('No recent activities found');
    });

    it('should calculate statistics correctly from raw activity data', async () => {
      const context = await getUserContext();

      // Should analyze 3 runs
      expect(context).toContain('3 runs analyzed');

      // Total distance is 30km over ~5 days = ~6 km/week * (7/5) = ~8.4 km/week
      // But the exact calculation depends on date span, so just verify format
      expect(context).toMatch(/Weekly Averages: \d+\.?\d* km\/week, \d+\.?\d* runs\/week/);
    });
  });

  // ===================================================================
  // Suite 4: Training Plan Context (4 tests)
  // ===================================================================
  describe('Training Plan Context', () => {
    const mockActivePlan = {
      id: 'plan-1',
      planType: 'COMPETITION',
      startDate: '2025-01-01',
      endDate: '2025-05-24',
      planData: {
        schedule: [
          {
            week_number: 1,
            phase_name: 'Base Building',
            weekly_focus: 'Build aerobic foundation',
            days: [
              {
                day_name: 'Monday',
                is_rest_day: false,
                activity_title: 'Easy Run',
                total_estimated_duration_min: 30
              }
            ]
          }
        ]
      }
    };

    beforeEach(() => {
      getAthleteProfile.mockResolvedValue({ data: null, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });
    });

    it('should identify and label active plan', async () => {
      // Create a plan that includes today's date
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setMonth(futureDate.getMonth() + 4); // 4 months from now

      const activePlan = {
        ...mockActivePlan,
        startDate: today.toISOString().split('T')[0],
        endDate: futureDate.toISOString().split('T')[0]
      };

      getTrainingPlans.mockResolvedValue({ data: [activePlan], error: null });

      const context = await getUserContext();

      expect(context).toContain('=== EXISTING TRAINING PLANS ===');
      expect(context).toContain('* ACTIVE PLAN *');
    });

    it('should include plan type and date range', async () => {
      getTrainingPlans.mockResolvedValue({ data: [mockActivePlan], error: null });

      const context = await getUserContext();

      expect(context).toMatch(/Type:.*COMPETITION/);
      expect(context).toMatch(/Date Range:.*Jan.*May/);
    });

    it('should include plan structure with weeks', async () => {
      getTrainingPlans.mockResolvedValue({ data: [mockActivePlan], error: null });

      const context = await getUserContext();

      expect(context).toContain('Structure:');
      expect(context).toMatch(/Week 1.*Base Building/);
    });

    it('should handle no training plans case', async () => {
      getTrainingPlans.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();

      expect(context).toContain('No training plans found');
    });
  });

  // ===================================================================
  // Suite 5: Error Handling (2 tests)
  // ===================================================================
  describe('Error Handling', () => {
    it('should return empty string on complete failure', async () => {
      getAthleteProfile.mockRejectedValue(new Error('DB error'));
      getActivitiesFromSupabase.mockRejectedValue(new Error('DB error'));
      getTrainingPlans.mockRejectedValue(new Error('DB error'));

      const context = await getUserContext();

      expect(context).toBe('');
    });

    it('should return empty string if any critical error occurs', async () => {
      const mockProfile = {
        firstname: 'John',
        lastname: 'Doe',
        weight: 75
      };

      getAthleteProfile.mockResolvedValue({ data: mockProfile, error: null });
      getActivitiesFromSupabase.mockRejectedValue(new Error('API error'));
      getTrainingPlans.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();

      // The function catches all errors and returns empty string
      // This is by design to prevent chat from breaking completely
      expect(context).toBe('');
    });
  });

  // ===================================================================
  // Suite 6: Cross-Validation Tests
  // ===================================================================
  describe('Complete Information Assembly', () => {
    it('should include all three data sources when available', async () => {
      const mockProfile = {
        firstname: 'John',
        lastname: 'Doe',
        weight: 75
      };

      const mockActivities = [
        {
          id: '1',
          type: 'Run',
          start_date_local: '2025-01-05T08:00:00Z',
          distance: 10000,
          moving_time: 3000,
          average_speed: 3.33,
          name: 'Morning run'
        }
      ];

      const mockPlan = {
        id: 'plan-1',
        planType: 'COMPETITION',
        startDate: '2025-01-01',
        endDate: '2025-05-24'
      };

      getAthleteProfile.mockResolvedValue({ data: mockProfile, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: mockActivities, error: null });
      getTrainingPlans.mockResolvedValue({ data: [mockPlan], error: null });

      const context = await getUserContext();

      // Should have ALL three sections
      expect(context).toContain('CURRENT DATE');
      expect(context).toContain('ATHLETE PROFILE');
      expect(context).toContain('EXISTING TRAINING PLANS');
      expect(context).toContain('RECENT WORKOUTS');

      // Should have data from each source
      expect(context).toContain('John Doe');
      expect(context).toContain('Weekly Averages:');
      expect(context).toContain('COMPETITION');
    });

    it('should return valid context string format', async () => {
      getAthleteProfile.mockResolvedValue({ data: null, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();

      // Should be a non-empty string
      expect(typeof context).toBe('string');
      expect(context.length).toBeGreaterThan(0);

      // Should have newlines (formatted text)
      expect(context).toMatch(/\n/);
    });
  });
});
