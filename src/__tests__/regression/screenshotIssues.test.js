import { describe, it, expect } from 'vitest';
import { trainingPlanSequence } from '../../prompts/prompts';

/**
 * Regression tests for TODO item (line 33):
 * "the user is not explicitly asked for injuries and how often / on which days they can train"
 *
 * Screenshot: /Users/hendrikdiler/Desktop/Cursor Projects/sportMe/screenshots/image copy 9.png
 *
 * These tests ensure that the intake sequence EXPLICITLY asks about:
 * 1. Injury history and health constraints
 * 2. Training frequency (how many days per week)
 * 3. Specific days of the week that work for the user
 *
 * If these tests fail, it means critical questions have been removed from the intake flow,
 * which would result in incomplete information for plan generation.
 */

describe('Screenshot Issue - Missing Questions (TODO Item)', () => {
  const intakeStart = trainingPlanSequence.find(s => s.id === 'intake-start');
  const validationStep = trainingPlanSequence.find(s => s.id === 'validation-gap-check');
  const summaryStep = trainingPlanSequence.find(s => s.id === 'athlete-summary');
  const generateStep = trainingPlanSequence.find(s => s.id === 'generate-plan');

  // Test 1: Verify injuries ARE explicitly asked
  describe('Injury History Questions', () => {
    it('should explicitly ask about injuries in intake-start step', () => {
      expect(intakeStart).toBeDefined();
      expect(intakeStart.userPrompt).toBeDefined();

      const prompt = intakeStart.userPrompt.toLowerCase();

      // Check for injury-related keywords
      expect(prompt).toContain('injury');

      // Check for the specific section about injuries
      expect(prompt).toMatch(/injury.*history|health.*constraint|medical.*limitation/i);

      // Verify it's listed as one of the questions to ask
      expect(intakeStart.userPrompt).toMatch(/3\.|injury history/i);
    });

    it('should include health constraints in injury question', () => {
      const prompt = intakeStart.userPrompt;

      // Should ask about both injuries AND health constraints
      expect(prompt).toMatch(/injury.*health|health.*constraint/i);
    });
  });

  // Test 2: Verify training frequency is asked
  describe('Training Frequency Questions', () => {
    it('should explicitly ask how many days per week user can train', () => {
      expect(intakeStart).toBeDefined();

      const prompt = intakeStart.userPrompt.toLowerCase();

      // Check for training frequency keywords
      expect(prompt).toMatch(/training frequency|days.*week|how many.*day/i);

      // Check for the specific section about frequency
      expect(intakeStart.userPrompt).toMatch(/4\.|training frequency/i);
    });

    it('should suggest frequency based on Strava and ask for confirmation', () => {
      const prompt = intakeStart.userPrompt;

      // Should mention making a suggestion based on Strava
      expect(prompt).toMatch(/I see you.*running.*days.*week|suggest.*based on.*strava/i);

      // Should ask user to confirm or adjust
      expect(prompt).toMatch(/confirm|adjust|continue|change/i);
    });
  });

  // Test 3: Verify specific days are asked
  describe('Specific Days Questions', () => {
    it('should explicitly ask which specific days of week work for user', () => {
      expect(intakeStart).toBeDefined();

      const prompt = intakeStart.userPrompt.toLowerCase();

      // Check for specific days keywords
      expect(prompt).toMatch(/which.*day|specific day|days.*work|monday.*wednesday|days of the week/i);
    });

    it('should ask for specific day names as examples', () => {
      const prompt = intakeStart.userPrompt;

      // Should provide examples like "Monday, Wednesday, Friday"
      expect(prompt).toMatch(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i);
    });
  });

  // Test 4: Verify validation checks for these answers
  describe('Validation Step Checks', () => {
    it('should validate user confirmed training days in validation step', () => {
      expect(validationStep).toBeDefined();
      expect(validationStep.userPrompt).toBeDefined();

      const prompt = validationStep.userPrompt.toLowerCase();

      // Should check for training frequency confirmation
      expect(prompt).toMatch(/training frequency.*confirmation|days per week.*confirmed/i);
    });

    it('should check for specific days of the week in validation', () => {
      const prompt = validationStep.userPrompt.toLowerCase();

      // Should verify specific days were collected
      expect(prompt).toMatch(/specific days.*week|which days|monday|tuesday|wednesday/i);
    });

    it('should check for cross-training preference in validation', () => {
      const prompt = validationStep.userPrompt.toLowerCase();

      // Should verify cross-training preference was collected
      expect(prompt).toMatch(/cross.*train.*preference|strength.*training.*preference/i);
    });
  });

  // Test 5: Verify summary includes these fields
  describe('Summary Includes Required Fields', () => {
    it('should include training frequency in summary', () => {
      expect(summaryStep).toBeDefined();
      expect(summaryStep.userPrompt).toBeDefined();

      const prompt = summaryStep.userPrompt;

      // Should have a dedicated field for training frequency
      expect(prompt).toContain('**Training frequency:**');
      expect(prompt).toMatch(/training frequency.*days per week/i);
    });

    it('should include training days in summary', () => {
      const prompt = summaryStep.userPrompt;

      // Should have a dedicated field for specific training days
      expect(prompt).toContain('**Training days:**');
      expect(prompt).toMatch(/specific days.*week|monday.*wednesday.*friday/i);
    });

    it('should include injuries/constraints in summary', () => {
      const prompt = summaryStep.userPrompt;

      // Should have a dedicated field for constraints and injuries
      expect(prompt).toContain('**Constraints/Injuries:**');
    });

    it('should use user answers (not Strava) for injury history in summary', () => {
      const prompt = summaryStep.userPrompt;

      // Should explicitly state that injury info comes from user answers
      expect(prompt).toMatch(/USE USER'S ANSWERS FOR/i);
      expect(prompt).toMatch(/injury history|health constraints/i);
    });

    it('should use user answers for training frequency and days in summary', () => {
      const prompt = summaryStep.userPrompt;

      // Should explicitly list these as coming from user answers
      const userAnswersSection = prompt.match(/USE USER'S ANSWERS FOR:([\s\S]*?)FORMAT/i);
      expect(userAnswersSection).toBeTruthy();

      const userAnswersText = userAnswersSection[1].toLowerCase();
      expect(userAnswersText).toMatch(/training frequency|days per week/);
      expect(userAnswersText).toMatch(/specific days.*week/);
    });
  });

  // Test 6: Verify plan generation uses these preferences
  describe('Plan Generation Enforces User Preferences', () => {
    it('should enforce training days in plan generation', () => {
      expect(generateStep).toBeDefined();
      expect(generateStep.userPrompt).toBeDefined();

      const prompt = generateStep.userPrompt;

      // Should have explicit rules about using exact training days
      expect(prompt).toMatch(/SPECIFIC days of the week they mentioned/i);
      expect(prompt).toMatch(/only schedule.*on those days/i);
    });

    it('should enforce exact number of training days', () => {
      const prompt = generateStep.userPrompt;

      // Should use EXACT number user confirmed
      expect(prompt).toMatch(/EXACT number.*training days/i);
      expect(prompt).toMatch(/do NOT add extra training days/i);
    });

    it('should respect injury and constraint information', () => {
      const prompt = generateStep.userPrompt;

      // Should have rules about respecting injury history
      expect(prompt).toMatch(/Respect ALL injury history/i);
      expect(prompt).toMatch(/health constraints|physical limitations/i);
    });

    it('should use exact start date without rounding', () => {
      const prompt = generateStep.userPrompt;

      // Should not round to Monday
      expect(prompt).toMatch(/use EXACTLY that date|do NOT adjust/i);
      expect(prompt).toMatch(/DO NOT.*round|DO NOT change.*start date.*Monday/i);
    });
  });
});
