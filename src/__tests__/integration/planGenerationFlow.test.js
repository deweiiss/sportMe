import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trainingPlanSequence } from '../../prompts/prompts';
import { getUserContext } from '../../services/contextRetrieval';

/**
 * Mock Supabase functions for integration tests
 */
vi.mock('../../services/supabase', () => ({
  getAthleteProfile: vi.fn(),
  getActivitiesFromSupabase: vi.fn(),
  getTrainingPlans: vi.fn()
}));

import { getAthleteProfile, getActivitiesFromSupabase, getTrainingPlans } from '../../services/supabase';

/**
 * Integration tests for the complete plan generation flow.
 *
 * These tests verify that the ENTIRE information pipeline works correctly:
 * 1. Intake sequence asks all required questions
 * 2. Context retrieval provides all necessary data
 * 3. The combination covers EVERYTHING the LLM needs for quality plan generation
 *
 * These are the ultimate tests to ensure no information gaps exist that would
 * prevent the LLM from generating personalized, safe, effective training plans.
 */

describe('Training Plan Generation - End-to-End Information Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Information Collection', () => {
    it('should collect all required information through intake sequence', () => {
      // Simulate the full intake sequence
      const intakeStep = trainingPlanSequence.find(s => s.id === 'intake-start');
      const validationStep = trainingPlanSequence.find(s => s.id === 'validation-gap-check');
      const summaryStep = trainingPlanSequence.find(s => s.id === 'athlete-summary');
      const generateStep = trainingPlanSequence.find(s => s.id === 'generate-plan');

      // Verify each step exists
      expect(intakeStep).toBeDefined();
      expect(validationStep).toBeDefined();
      expect(summaryStep).toBeDefined();
      expect(generateStep).toBeDefined();

      // CRITICAL: Verify intake asks for non-Strava info
      expect(intakeStep.userPrompt).toMatch(/goal.*timeline/i);
      expect(intakeStep.userPrompt).toMatch(/injury.*history/i);
      expect(intakeStep.userPrompt).toMatch(/training frequency/i);
      expect(intakeStep.userPrompt).toMatch(/which.*days.*week/i);
      expect(intakeStep.userPrompt).toMatch(/cross.*train|strength.*train/i);

      // CRITICAL: Verify validation checks for completeness
      expect(validationStep.userPrompt).toMatch(/training frequency.*confirmation/i);
      expect(validationStep.userPrompt).toMatch(/specific days/i);

      // CRITICAL: Verify summary shows all collected data
      expect(summaryStep.userPrompt).toContain('**Goal:**');
      expect(summaryStep.userPrompt).toContain('**Training frequency:**');
      expect(summaryStep.userPrompt).toContain('**Training days:**');
      expect(summaryStep.userPrompt).toContain('**Constraints/Injuries:**');
      expect(summaryStep.userPrompt).toContain('**Cross-training/Strength:**');

      // CRITICAL: Verify generate step uses full conversation history
      expect(generateStep.userPrompt).toMatch(/FULL CONVERSATION HISTORY/i);
      expect(generateStep.userPrompt).toMatch(/ALL.*athlete.*detailed answers/i);
    });

    it('should provide complete context from getUserContext', async () => {
      // Mock complete data from all sources
      const mockProfile = {
        firstname: 'John',
        lastname: 'Doe',
        weight: 75,
        birthday: '1990-05-15'
      };

      const mockActivities = [
        {
          id: '1',
          type: 'Run',
          start_date_local: '2025-01-05T08:00:00Z',
          distance: 10000,
          moving_time: 3000,
          average_speed: 3.33
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

      // Verify context has Strava data
      expect(context).toContain('Weekly Averages:');
      expect(context).toMatch(/\d+\.?\d* km\/week/);
      expect(context).toMatch(/\d+\.?\d* runs\/week/);

      // Verify context has profile data
      expect(context).toContain('John Doe');
      expect(context).toContain('Weight: 75 kg');

      // Verify context has current date/year (CRITICAL)
      expect(context).toContain('THE YEAR IS:');
      expect(context).toMatch(/TODAY.*\d{4}/);
      expect(context).toContain('TOMORROW (default start):');
    });
  });

  describe('Information Completeness Checklist', () => {
    it('should have all information needed to generate quality plan', async () => {
      // Mock minimal data to verify all sources are consulted
      const mockProfile = {
        weight: 75,
        birthday: '1990-05-15'
      };

      const mockActivities = [
        {
          id: '1',
          type: 'Run',
          start_date_local: '2025-01-05T08:00:00Z',
          distance: 10000,
          moving_time: 3000,
          average_speed: 3.33
        }
      ];

      getAthleteProfile.mockResolvedValue({ data: mockProfile, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: mockActivities, error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();
      const allPrompts = trainingPlanSequence.map(s => s.userPrompt).join(' ');

      // ============================================================
      // REQUIRED FROM STRAVA (context)
      // ============================================================
      expect(context).toMatch(/\d+\.?\d* km\/week/); // Weekly volume
      expect(context).toMatch(/\d+\.?\d* runs\/week/); // Frequency
      expect(context).toMatch(/Longest:.*\d+\.?\d* km/); // Longest run
      expect(context).toMatch(/Avg Pace:.*\d+\.?\d* min\/km/); // Pace
      expect(context).toMatch(/\d+ runs in last 30 days/); // Recent frequency

      // ============================================================
      // REQUIRED FROM USER (intake questions)
      // ============================================================
      expect(allPrompts).toMatch(/goal/i); // Training goal
      expect(allPrompts).toMatch(/timeline|target.*date/i); // Goal date
      expect(allPrompts).toMatch(/injury.*history/i); // Injury history
      expect(allPrompts).toMatch(/training frequency|days.*week/i); // Training frequency
      expect(allPrompts).toMatch(/which.*days|specific days/i); // Specific days
      expect(allPrompts).toMatch(/cross.*train|strength.*train/i); // Cross-training preference
      expect(allPrompts).toMatch(/start.*date/i); // Start date

      // ============================================================
      // REQUIRED FROM PROFILE (context)
      // ============================================================
      expect(context).toMatch(/Weight:.*\d+ kg/); // Weight

      // ============================================================
      // DATE INFORMATION (context) - CRITICAL
      // ============================================================
      expect(context).toContain('THE YEAR IS:'); // Current year
      expect(context).toMatch(/TODAY.*\d{4}/); // Full date
      expect(context).toMatch(/YYYY-MM-DD/); // ISO format date
      expect(context).toContain('TOMORROW'); // Default start date

      // ============================================================
      // VALIDATION: No redundant questions
      // ============================================================
      // Should NOT ask for data already in Strava
      const intakePrompt = trainingPlanSequence[0].userPrompt;
      expect(intakePrompt).toContain('DO NOT ASK for information you can already see');
      expect(intakePrompt).toMatch(/weekly.*kilometer|weekly averages.*strava/i);
    });

    it('should prevent information gaps that would cause poor plan generation', () => {
      const intakeStep = trainingPlanSequence.find(s => s.id === 'intake-start');
      const generateStep = trainingPlanSequence.find(s => s.id === 'generate-plan');

      // These are the MINIMUM required fields for safe plan generation
      const requiredFields = {
        // From user answers
        goal: /goal/i,
        timeline: /timeline|target.*date|when/i,
        injuryHistory: /injury.*history|health.*constraint/i,
        trainingFrequency: /training frequency|days.*week/i,
        specificDays: /which.*days|specific days/i,
        startDate: /start.*date|when.*start/i,
        crossTraining: /cross.*train|strength.*train/i,
      };

      Object.entries(requiredFields).forEach(([field, pattern]) => {
        expect(
          intakeStep.userPrompt,
          `intake-start must ask about ${field}`
        ).toMatch(pattern);
      });

      // Verify generate step will use all this information
      expect(
        generateStep.userPrompt,
        'generate-plan must use full conversation history'
      ).toMatch(/FULL CONVERSATION HISTORY|ALL.*detailed answers/i);

      // Verify constraints are enforced
      const criticalConstraints = [
        /EXACT number.*training days/i,
        /SPECIFIC days.*week.*mentioned/i,
        /respect ALL injury history/i,
        /ONLY include strength.*if.*explicitly requested/i,
        /use EXACTLY that date/i, // Don't round start date
      ];

      criticalConstraints.forEach((constraint, index) => {
        expect(
          generateStep.userPrompt,
          `generate-plan must enforce constraint ${index + 1}`
        ).toMatch(constraint);
      });
    });
  });

  describe('Data Source Integration', () => {
    it('should correctly distinguish between Strava data and user input', () => {
      const intakeStep = trainingPlanSequence.find(s => s.id === 'intake-start');
      const summaryStep = trainingPlanSequence.find(s => s.id === 'athlete-summary');

      // Things that SHOULD be in Strava (should NOT be asked)
      const stravaDataPoints = [
        'Weekly kilometers',
        'How often they run',
        'Longest run',
        'Recent training'
      ];

      stravaDataPoints.forEach(dataPoint => {
        expect(
          intakeStep.userPrompt,
          `Should NOT ask for ${dataPoint} (it's in Strava)`
        ).toContain(dataPoint);
      });

      // Things that MUST be asked (not in Strava)
      const userDataPoints = [
        { name: 'Goal', pattern: /goal/i },
        { name: 'Injury history', pattern: /injury/i },
        { name: 'Training frequency confirmation', pattern: /training frequency/i },
        { name: 'Specific days', pattern: /which.*days|specific days/i }
      ];

      userDataPoints.forEach(({ name, pattern }) => {
        expect(
          summaryStep.userPrompt,
          `Summary should list ${name} under USER'S ANSWERS`
        ).toMatch(pattern);
      });
    });

    it('should use About Me profile data when available', async () => {
      const mockProfile = {
        firstname: 'Jane',
        lastname: 'Smith',
        weight: 60,
        birthday: '1995-03-20',
        city: 'Munich',
        country: 'Germany'
      };

      getAthleteProfile.mockResolvedValue({ data: mockProfile, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();

      // Profile data should be automatically included in context
      expect(context).toContain('Jane Smith');
      expect(context).toContain('Weight: 60 kg');
      expect(context).toContain('Munich, Germany');

      // This data should NOT be asked in intake (already in profile)
      const intakeStep = trainingPlanSequence.find(s => s.id === 'intake-start');
      // Intake should focus on training-specific questions, not profile data
      expect(intakeStep.userPrompt).not.toMatch(/what.*your.*name/i);
      expect(intakeStep.userPrompt).not.toMatch(/how much.*you.*weigh/i);
    });
  });

  describe('Date Handling (Critical for Plan Generation)', () => {
    it('should provide current year prominently to prevent common bug', async () => {
      getAthleteProfile.mockResolvedValue({ data: null, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();
      const currentYear = new Date().getFullYear();

      // Year should be mentioned multiple times to emphasize importance
      const yearMatches = context.match(new RegExp(currentYear, 'g'));
      expect(
        yearMatches,
        'Current year should appear multiple times in context'
      ).toBeTruthy();
      expect(yearMatches.length).toBeGreaterThanOrEqual(3);

      // Should have explicit warnings about using correct year
      expect(context).toContain('NOT 2023, NOT 2024');
      expect(context).toContain(`ALL dates in your plan MUST use year ${currentYear}`);
    });

    it('should provide tomorrow as default start date', async () => {
      getAthleteProfile.mockResolvedValue({ data: null, error: null });
      getActivitiesFromSupabase.mockResolvedValue({ data: [], error: null });
      getTrainingPlans.mockResolvedValue({ data: [], error: null });

      const context = await getUserContext();
      const intakeStep = trainingPlanSequence.find(s => s.id === 'intake-start');

      // Context should provide tomorrow's date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      expect(context).toContain(tomorrowStr);

      // Intake should default to tomorrow if not specified
      expect(intakeStep.userPrompt).toMatch(/if not specified.*tomorrow/i);
    });
  });
});
