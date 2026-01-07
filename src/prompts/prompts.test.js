import { describe, it, expect } from 'vitest';
import {
  trainingPlanSequence,
  getTrainingPlanStep,
  getDefaultTrainingPlanStep,
  BASE_COACH_PROMPT
} from './prompts';

/**
 * Comprehensive tests for the training plan intake sequence.
 *
 * The intake sequence is a 4-step conversation flow that collects all necessary
 * information to generate a personalized training plan. These tests ensure:
 *
 * 1. All required questions are asked
 * 2. Strava data is used appropriately (not re-asked)
 * 3. User answers are validated and summarized correctly
 * 4. Plan generation enforces all user preferences
 *
 * If these tests fail, it indicates that critical prompts have been modified
 * in a way that could result in incomplete information for plan generation.
 */

describe('trainingPlanSequence', () => {
  // ===================================================================
  // Suite 1: Sequence Structure (4 tests)
  // ===================================================================
  describe('Sequence Structure', () => {
    it('should have exactly 4 steps in correct order', () => {
      expect(trainingPlanSequence).toHaveLength(4);
      expect(trainingPlanSequence[0].id).toBe('intake-start');
      expect(trainingPlanSequence[1].id).toBe('validation-gap-check');
      expect(trainingPlanSequence[2].id).toBe('athlete-summary');
      expect(trainingPlanSequence[3].id).toBe('generate-plan');
    });

    it('should have correct nextId chain', () => {
      expect(trainingPlanSequence[0].nextId).toBe('validation-gap-check');
      expect(trainingPlanSequence[1].nextId).toBe('athlete-summary');
      expect(trainingPlanSequence[2].nextId).toBe('generate-plan');
      expect(trainingPlanSequence[3].nextId).toBe(null);
    });

    it('should have all required fields for each step', () => {
      trainingPlanSequence.forEach(step => {
        expect(step).toHaveProperty('id');
        expect(step).toHaveProperty('title');
        expect(step).toHaveProperty('systemPrompt');
        expect(step).toHaveProperty('userPrompt');
        expect(step).toHaveProperty('nextId');

        // Verify all are defined and have content
        expect(step.id).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.systemPrompt).toBeTruthy();
        expect(step.userPrompt).toBeTruthy();
      });
    });

    it('should have getter functions working correctly', () => {
      const intakeStart = getTrainingPlanStep('intake-start');
      expect(intakeStart).toBeDefined();
      expect(intakeStart.id).toBe('intake-start');

      const defaultStep = getDefaultTrainingPlanStep();
      expect(defaultStep).toBeDefined();
      expect(defaultStep.id).toBe('intake-start');
    });
  });

  // ===================================================================
  // Suite 2: Critical Information Coverage (7 tests)
  // ===================================================================
  describe('intake-start - Required Questions', () => {
    const intakeStart = trainingPlanSequence.find(s => s.id === 'intake-start');
    const prompt = intakeStart.userPrompt;

    it('should explicitly ask about injury history', () => {
      expect(prompt.toLowerCase()).toContain('injury');
      expect(prompt).toMatch(/injury.*history|health.*constraint|medical.*limitation/i);
    });

    it('should explicitly ask about training frequency confirmation', () => {
      expect(prompt.toLowerCase()).toContain('training frequency');
      expect(prompt).toMatch(/how many.*day|days.*week|frequency/i);
      expect(prompt).toMatch(/confirm|adjust/i);
    });

    it('should explicitly ask which specific days of the week work', () => {
      expect(prompt).toMatch(/which.*day|specific day|days.*work best/i);
      expect(prompt).toMatch(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i);
    });

    it('should ask about goal and timeline', () => {
      expect(prompt.toLowerCase()).toContain('goal');
      expect(prompt).toMatch(/timeline|target.*date|when/i);
      expect(prompt).toMatch(/what.*training for|event|goal/i);
    });

    it('should ask about plan start date', () => {
      expect(prompt).toMatch(/start.*date|when.*start|plan.*begin/i);
    });

    it('should ask about cross-training and strength preference', () => {
      expect(prompt).toMatch(/cross.*train|strength.*train/i);
      expect(prompt).toMatch(/include|want/i);
    });

    it('should suggest default start date as tomorrow if not specified', () => {
      expect(prompt).toMatch(/tomorrow|default.*tomorrow/i);
      expect(prompt).toMatch(/if not specified/i);
    });
  });

  // ===================================================================
  // Suite 3: Strava Data Integration Rules (6 tests)
  // ===================================================================
  describe('intake-start - Strava Data Usage', () => {
    const intakeStart = trainingPlanSequence.find(s => s.id === 'intake-start');
    const prompt = intakeStart.userPrompt;

    it('should instruct NOT to ask for weekly kilometers (available in Strava)', () => {
      expect(prompt).toContain('DO NOT ASK for information you can already see');
      expect(prompt).toMatch(/weekly.*km|km.*week|weekly.*kilometer/i);
      expect(prompt).toMatch(/use.*weekly averages|from.*strava/i);
    });

    it('should instruct NOT to ask for run frequency (available in Strava)', () => {
      expect(prompt).toMatch(/how often they run|runs.*week|run frequency/i);
      expect(prompt).toMatch(/use.*runs.*week|from.*strava/i);
    });

    it('should instruct NOT to ask for longest run (available in Strava)', () => {
      expect(prompt).toMatch(/longest.*run/i);
      expect(prompt).toMatch(/use.*longest|from.*strava/i);
    });

    it('should instruct to acknowledge Strava data at start', () => {
      expect(prompt).toContain('START your response by stating what you can see');
      expect(prompt).toMatch(/I can see from your Strava/i);
    });

    it('should warn against claiming no Strava access', () => {
      expect(prompt).toMatch(/NEVER say you cannot access.*Strava/i);
      expect(prompt).toMatch(/REAL data.*Strava account/i);
    });

    it('should list what data is available in Strava', () => {
      // Should list the specific data points available
      expect(prompt).toMatch(/weekly averages|km.*week|runs.*week/i);
      expect(prompt).toMatch(/longest|recent.*run/i);
      expect(prompt).toMatch(/pace/i); // Paces mentioned in activity listings
    });
  });

  // ===================================================================
  // Suite 4: Validation Step Completeness (5 tests)
  // ===================================================================
  describe('validation-gap-check - Missing Information Detection', () => {
    const validationStep = trainingPlanSequence.find(s => s.id === 'validation-gap-check');
    const prompt = validationStep.userPrompt;

    it('should check for training frequency confirmation', () => {
      expect(prompt).toMatch(/training frequency.*confirmation|days per week.*confirmed/i);
    });

    it('should check for specific days of week', () => {
      expect(prompt).toMatch(/specific days.*week|which days|monday|tuesday|wednesday/i);
    });

    it('should check for cross-training preference', () => {
      expect(prompt).toMatch(/cross.*train.*preference|strength.*training.*preference/i);
    });

    it('should remember what\'s already in Strava (not re-check)', () => {
      expect(prompt).toContain('You already have from Strava');
      expect(prompt).toMatch(/weekly volume|run frequency|km.*week|runs.*week/i);
    });

    it('should instruct to ask 1-2 questions max if gaps exist', () => {
      expect(prompt).toMatch(/1-2 questions/i);
      expect(prompt).toMatch(/if.*missing|if.*gap/i);
    });
  });

  // ===================================================================
  // Suite 5: Summary Step Data Sources (7 tests)
  // ===================================================================
  describe('athlete-summary - Data Source Mapping', () => {
    const summaryStep = trainingPlanSequence.find(s => s.id === 'athlete-summary');
    const prompt = summaryStep.userPrompt;

    it('should use Strava data for weekly volume', () => {
      expect(prompt).toContain('USE STRAVA DATA FOR');
      expect(prompt).toMatch(/weekly.*volume|km.*week/i);
      expect(prompt).toMatch(/weekly averages/i);
    });

    it('should use user answers for injury history', () => {
      expect(prompt).toContain('USE USER\'S ANSWERS FOR');
      expect(prompt).toMatch(/injury history|health constraints/i);
    });

    it('should use user answers for training frequency and specific days', () => {
      const userAnswersSection = prompt.match(/USE USER'S ANSWERS FOR:([\s\S]*?)FORMAT/i);
      expect(userAnswersSection).toBeTruthy();

      const userAnswersText = userAnswersSection[1];
      expect(userAnswersText).toMatch(/training frequency|days per week/i);
      expect(userAnswersText).toMatch(/specific days.*week/i);
    });

    it('should use user answers for cross-training preference', () => {
      expect(prompt).toMatch(/cross.*training.*preference|strength.*training.*preference/i);

      const userAnswersSection = prompt.match(/USE USER'S ANSWERS FOR:([\s\S]*?)FORMAT/i);
      expect(userAnswersSection).toBeTruthy();
      expect(userAnswersSection[1]).toMatch(/cross.*train|strength.*train/i);
    });

    it('should default start date to tomorrow if not specified', () => {
      expect(prompt).toContain('**Plan start date:**');
      expect(prompt).toMatch(/tomorrow.*if not specified/i);
    });

    it('should include all required summary sections', () => {
      expect(prompt).toContain('**Goal:**');
      expect(prompt).toContain('**Plan start date:**');
      expect(prompt).toContain('**Current fitness (from Strava):**');
      expect(prompt).toContain('**Training frequency:**');
      expect(prompt).toContain('**Training days:**');
      expect(prompt).toContain('**Constraints/Injuries:**');
      expect(prompt).toContain('**Cross-training/Strength:**');
    });

    it('should end with user confirmation request', () => {
      expect(prompt).toMatch(/does this look correct|confirm|yes.*adjust/i);
    });
  });

  // ===================================================================
  // Suite 6: Plan Generation Constraints (4 tests)
  // ===================================================================
  describe('generate-plan - User Preferences Enforcement', () => {
    const generateStep = trainingPlanSequence.find(s => s.id === 'generate-plan');
    const prompt = generateStep.userPrompt;

    it('should enforce exact training days from user confirmation', () => {
      expect(prompt).toMatch(/EXACT number.*training days/i);
      expect(prompt).toMatch(/SPECIFIC days of the week they mentioned/i);
      expect(prompt).toMatch(/do NOT add extra training days/i);
      expect(prompt).toMatch(/only schedule.*on those days/i);
    });

    it('should enforce cross-training preference (only if requested)', () => {
      expect(prompt).toMatch(/ONLY include strength training.*if.*explicitly requested/i);
      expect(prompt).toMatch(/if.*said NO.*do NOT add/i);
    });

    it('should use exact start date without rounding to Monday', () => {
      expect(prompt).toMatch(/use EXACTLY that date/i);
      expect(prompt).toMatch(/do NOT adjust/i);
      expect(prompt).toMatch(/DO NOT.*round|DO NOT change.*start date.*Monday/i);
    });

    it('should respect injury and constraint information', () => {
      expect(prompt).toMatch(/respect ALL injury history/i);
      expect(prompt).toMatch(/health constraints|physical limitations/i);
    });
  });

  // ===================================================================
  // Additional Integration Tests
  // ===================================================================
  describe('Cross-Step Consistency', () => {
    it('should maintain consistent terminology across all steps', () => {
      const allPrompts = trainingPlanSequence.map(s => s.userPrompt).join(' ');

      // Key terms should appear across multiple steps
      expect(allPrompts).toMatch(/injury/gi);
      expect(allPrompts).toMatch(/training frequency|days.*week/gi);
      expect(allPrompts).toMatch(/cross.*train|strength.*train/gi);
    });

    it('should use BASE_COACH_PROMPT as system prompt for all steps', () => {
      trainingPlanSequence.forEach(step => {
        expect(step.systemPrompt).toBe(BASE_COACH_PROMPT);
      });
    });

    it('should have increasing detail from intake to generation', () => {
      const intakePrompt = trainingPlanSequence[0].userPrompt;
      const summaryPrompt = trainingPlanSequence[2].userPrompt;
      const generatePrompt = trainingPlanSequence[3].userPrompt;

      // Generate prompt should be longest (most detailed instructions)
      expect(generatePrompt.length).toBeGreaterThan(intakePrompt.length);
      expect(generatePrompt.length).toBeGreaterThan(summaryPrompt.length);
    });
  });
});
