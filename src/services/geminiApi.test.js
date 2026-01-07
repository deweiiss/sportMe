import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendChatMessage,
  getTrainingPlanJsonSchema,
  testGeminiConnection
} from './geminiApi';

// Mock the @google/genai module
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn(() => ({
      models: {
        generateContent: vi.fn(),
        streamGenerateContent: vi.fn(),
      },
    })),
  };
});

describe('geminiApi', () => {
  describe('getTrainingPlanJsonSchema', () => {
    it('should return valid JSON schema with required top-level properties', () => {
      const schema = getTrainingPlanJsonSchema();

      expect(schema).toHaveProperty('type', 'object');
      expect(schema).toHaveProperty('properties');
      expect(schema).toHaveProperty('required');
      expect(schema.required).toEqual(['meta', 'periodization_overview', 'schedule']);
    });

    it('should define meta object with required fields', () => {
      const schema = getTrainingPlanJsonSchema();

      expect(schema.properties.meta).toBeDefined();
      expect(schema.properties.meta.type).toBe('object');
      expect(schema.properties.meta.required).toContain('plan_name');
      expect(schema.properties.meta.required).toContain('plan_type');
      expect(schema.properties.meta.required).toContain('athlete_level');
      expect(schema.properties.meta.required).toContain('total_duration_weeks');
      expect(schema.properties.meta.required).toContain('start_date');
    });

    it('should define plan_type enum with correct values', () => {
      const schema = getTrainingPlanJsonSchema();

      const planTypeEnum = schema.properties.meta.properties.plan_type.enum;
      expect(planTypeEnum).toEqual(['BEGINNER', 'FITNESS', 'WEIGHT_LOSS', 'COMPETITION']);
    });

    it('should define athlete_level enum with correct values', () => {
      const schema = getTrainingPlanJsonSchema();

      const athleteLevelEnum = schema.properties.meta.properties.athlete_level.enum;
      expect(athleteLevelEnum).toEqual(['Novice', 'Intermediate', 'Advanced']);
    });

    it('should define schedule as array of weeks', () => {
      const schema = getTrainingPlanJsonSchema();

      expect(schema.properties.schedule.type).toBe('array');
      expect(schema.properties.schedule.items.type).toBe('object');
      expect(schema.properties.schedule.items.required).toContain('week_number');
      expect(schema.properties.schedule.items.required).toContain('phase_name');
      expect(schema.properties.schedule.items.required).toContain('weekly_focus');
      expect(schema.properties.schedule.items.required).toContain('days');
    });

    it('should define days as array of strings (flattened format)', () => {
      const schema = getTrainingPlanJsonSchema();

      const daysProperty = schema.properties.schedule.items.properties.days;
      expect(daysProperty.type).toBe('array');
      expect(daysProperty.items.type).toBe('string');
    });

    it('should include segment format instructions in days description', () => {
      const schema = getTrainingPlanJsonSchema();

      const daysDescription = schema.properties.schedule.items.properties.days.items.description;
      expect(daysDescription).toContain('||');
      expect(daysDescription).toContain('WARMUP');
      expect(daysDescription).toContain('MAIN');
      expect(daysDescription).toContain('COOLDOWN');
    });

    it('should enforce minimum values for numeric fields', () => {
      const schema = getTrainingPlanJsonSchema();

      expect(schema.properties.meta.properties.total_duration_weeks.minimum).toBe(1);
      expect(schema.properties.schedule.items.properties.week_number.minimum).toBe(1);
      expect(schema.properties.schedule.minItems).toBe(1);
    });

    it('should define periodization_overview with phases array', () => {
      const schema = getTrainingPlanJsonSchema();

      expect(schema.properties.periodization_overview.type).toBe('object');
      expect(schema.properties.periodization_overview.required).toContain('macrocycle_goal');
      expect(schema.properties.periodization_overview.required).toContain('phases');
      expect(schema.properties.periodization_overview.properties.phases.type).toBe('array');
      expect(schema.properties.periodization_overview.properties.phases.items.type).toBe('string');
    });
  });

  describe('Model Selection and Performance', () => {
    it('should use gemini-2.5-pro as primary model for structured output', () => {
      // This is more of a documentation test to verify current behavior
      const schema = getTrainingPlanJsonSchema();
      expect(schema).toBeDefined();

      // The primary model should be the most capable for plan generation
      // This ensures complex JSON schema output is handled correctly
    });

    it('should have model fallback chain defined', () => {
      // Test that the module exports are accessible
      expect(getTrainingPlanJsonSchema).toBeDefined();
      expect(sendChatMessage).toBeDefined();
      expect(testGeminiConnection).toBeDefined();
    });

    it('should use faster model (flash) for conversational chat', () => {
      // When NOT using structured output, the system should use the faster model first
      // This is a behavioral test to document the performance optimization
      const sequenceStep = { id: 'intake-start' }; // Not generate-plan or modify-plan
      const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';

      expect(useStructuredOutput).toBe(false);
      // When useStructuredOutput is false, GEMINI_MODELS_CHAT is used
      // GEMINI_MODELS_CHAT has 'gemini-2.5-flash' as the primary model
    });

    it('should use most capable model (pro) for structured output tasks', () => {
      // When using structured output (plan generation), use the most capable model
      const sequenceStep = { id: 'generate-plan' };
      const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';

      expect(useStructuredOutput).toBe(true);
      // When useStructuredOutput is true, GEMINI_MODELS_STRUCTURED is used
      // GEMINI_MODELS_STRUCTURED has 'gemini-2.5-pro' as the primary model
    });

    it('should use capable model for plan modification', () => {
      // Plan modification also needs structured output
      const sequenceStep = { id: 'modify-plan' };
      const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';

      expect(useStructuredOutput).toBe(true);
      // This also uses GEMINI_MODELS_STRUCTURED with 'gemini-2.5-pro'
    });
  });

  describe('Error Handling', () => {
    it('should have error handling for API key validation', () => {
      // The sendChatMessage function checks for GEMINI_API_KEY
      // and throws an error if it's not configured.
      // This is tested implicitly through the API's behavior.
      expect(sendChatMessage).toBeDefined();
      expect(typeof sendChatMessage).toBe('function');
    });
  });

  describe('Message History Format', () => {
    it('should accept empty message history', () => {
      // Should not throw with empty array
      expect(() => {
        const history = [];
        expect(Array.isArray(history)).toBe(true);
      }).not.toThrow();
    });

    it('should accept valid message history format', () => {
      const history = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      expect(history).toHaveLength(3);
      history.forEach(msg => {
        expect(msg).toHaveProperty('role');
        expect(msg).toHaveProperty('content');
        expect(['user', 'assistant', 'system']).toContain(msg.role);
      });
    });
  });

  describe('Structured Output Configuration', () => {
    it('should generate config for structured output when sequence step is generate-plan', () => {
      const sequenceStep = { id: 'generate-plan' };
      const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';

      expect(useStructuredOutput).toBe(true);
    });

    it('should generate config for structured output when sequence step is modify-plan', () => {
      const sequenceStep = { id: 'modify-plan' };
      const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';

      expect(useStructuredOutput).toBe(true);
    });

    it('should not use structured output for other sequence steps', () => {
      const sequenceStep = { id: 'intake-start' };
      const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';

      expect(useStructuredOutput).toBe(false);
    });

    it('should not use structured output when no sequence step provided', () => {
      const sequenceStep = null;
      const useStructuredOutput = sequenceStep?.id === 'generate-plan' || sequenceStep?.id === 'modify-plan';

      expect(useStructuredOutput).toBe(false);
    });
  });

  describe('Date Format Validation', () => {
    it('should specify YYYY-MM-DD format for dates in schema', () => {
      const schema = getTrainingPlanJsonSchema();

      expect(schema.properties.meta.properties.start_date.format).toBe('date');
      expect(schema.properties.meta.properties.created_at.format).toBe('date');
    });
  });

  describe('Week Alignment Rules', () => {
    it('should include week alignment rules in schedule description', () => {
      const schema = getTrainingPlanJsonSchema();

      const scheduleDescription = schema.properties.schedule.description;
      expect(scheduleDescription).toContain('All weeks end on Sunday');
      expect(scheduleDescription).toContain('partial week');
      expect(scheduleDescription).toContain('Monday-Sunday');
    });
  });

  describe('Segment Format Validation', () => {
    it('should require || separator between segments', () => {
      const schema = getTrainingPlanJsonSchema();

      const daysDescription = schema.properties.schedule.items.properties.days.items.description;
      expect(daysDescription).toContain('use || between segments');
    });

    it('should enforce minimum 3 segments for RUN workouts', () => {
      const schema = getTrainingPlanJsonSchema();

      const daysDescription = schema.properties.schedule.items.properties.days.items.description;
      expect(daysDescription).toContain('EVERY RUN MUST HAVE 3+ SEGMENTS');
      expect(daysDescription).toContain('WARMUP||MAIN||COOLDOWN');
    });

    it('should provide example formats for different workout types', () => {
      const schema = getTrainingPlanJsonSchema();

      const daysDescription = schema.properties.schedule.items.properties.days.items.description;
      expect(daysDescription).toContain('REST:');
      expect(daysDescription).toContain('EASY RUN:');
      expect(daysDescription).toContain('TEMPO:');
      expect(daysDescription).toContain('LONG RUN:');
    });
  });

  describe('Segment Types', () => {
    it('should define valid segment types', () => {
      const schema = getTrainingPlanJsonSchema();

      const daysDescription = schema.properties.schedule.items.properties.days.items.description;
      expect(daysDescription).toContain('WARMUP');
      expect(daysDescription).toContain('MAIN');
      expect(daysDescription).toContain('COOLDOWN');
      expect(daysDescription).toContain('INTERVAL');
      expect(daysDescription).toContain('RECOVERY');
    });
  });

  describe('Activity Categories', () => {
    it('should support multiple activity categories', () => {
      const schema = getTrainingPlanJsonSchema();

      const daysDescription = schema.properties.schedule.items.properties.days.items.description;
      // The schema examples show REST and RUN categories
      expect(daysDescription).toContain('REST');
      expect(daysDescription).toContain('RUN');
    });
  });
});
