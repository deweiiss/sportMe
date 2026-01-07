import { describe, it, expect } from 'vitest';
import { isModificationRequest } from './planModificationDetection';

describe('planModificationDetection', () => {
  describe('isModificationRequest', () => {
    describe('Questions (should return false)', () => {
      it('should detect questions starting with question words', () => {
        expect(isModificationRequest('how many days per week did you assume?')).toBe(false);
        expect(isModificationRequest('what is the total distance?')).toBe(false);
        expect(isModificationRequest('why did you include strength training?')).toBe(false);
        expect(isModificationRequest('when should I do my long run?')).toBe(false);
        expect(isModificationRequest('where should I run this workout?')).toBe(false);
        expect(isModificationRequest('which day is the tempo run?')).toBe(false);
      });

      it('should detect questions ending with question mark', () => {
        expect(isModificationRequest('Is this too much volume?')).toBe(false);
        expect(isModificationRequest('Should I include a rest day?')).toBe(false);
        expect(isModificationRequest('Can I see the plan for week 3?')).toBe(false);
      });

      it('should detect "how many/much" questions', () => {
        expect(isModificationRequest('how many runs per week?')).toBe(false);
        expect(isModificationRequest('how much total mileage?')).toBe(false);
      });

      it('should detect "explain/tell/show" questions', () => {
        expect(isModificationRequest('can you explain the intervals?')).toBe(false);
        expect(isModificationRequest('can you tell me about zone 4?')).toBe(false);
        expect(isModificationRequest('can you show me week 5?')).toBe(false);
      });

      it('should detect German questions', () => {
        expect(isModificationRequest('wie viele Läufe pro Woche?')).toBe(false);
        expect(isModificationRequest('was ist Zone 2?')).toBe(false);
        expect(isModificationRequest('warum hast du das so geplant?')).toBe(false);
        expect(isModificationRequest('wann soll ich laufen?')).toBe(false);
      });
    });

    describe('Modification requests (should return true)', () => {
      it('should detect explicit modification verbs at start', () => {
        expect(isModificationRequest('change the Monday run to Tuesday')).toBe(true);
        expect(isModificationRequest('modify week 3 to be easier')).toBe(true);
        expect(isModificationRequest('update the plan to 4 days per week')).toBe(true);
        expect(isModificationRequest('adjust the tempo run intensity')).toBe(true);
        expect(isModificationRequest('move the long run to Saturday')).toBe(true);
        expect(isModificationRequest('add a rest day on Wednesday')).toBe(true);
        expect(isModificationRequest('remove the interval workout')).toBe(true);
      });

      it('should detect polite modification requests', () => {
        expect(isModificationRequest('can you change the Monday workout?')).toBe(true);
        expect(isModificationRequest('could you modify week 2?')).toBe(true);
        expect(isModificationRequest('would you update the schedule?')).toBe(true);
      });

      it('should detect "I want/need" modification requests', () => {
        expect(isModificationRequest('I want to change the long run day')).toBe(true);
        expect(isModificationRequest('I need to modify the intensity')).toBe(true);
        expect(isModificationRequest('I would like to adjust week 5')).toBe(true);
      });

      it('should detect intensity modification requests', () => {
        expect(isModificationRequest('make it easier')).toBe(true);
        expect(isModificationRequest('make it harder')).toBe(true);
        expect(isModificationRequest('make it longer')).toBe(true);
        expect(isModificationRequest('make it shorter')).toBe(true);
        expect(isModificationRequest('make it more intense')).toBe(true);
        expect(isModificationRequest('make it less volume')).toBe(true);
      });

      it('should detect German modification requests', () => {
        expect(isModificationRequest('ändere den Plan')).toBe(true);
        expect(isModificationRequest('verschiebe das Training')).toBe(true);
        expect(isModificationRequest('anpassen auf 3 Tage')).toBe(true);
        expect(isModificationRequest('ersetze den Intervalllauf')).toBe(true);
      });

      it('should detect "instead of" modifications', () => {
        expect(isModificationRequest('run on Tuesday instead of Monday')).toBe(true);
        expect(isModificationRequest('do 5k instead of 10k')).toBe(true);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty or invalid input', () => {
        expect(isModificationRequest('')).toBe(false);
        expect(isModificationRequest(null)).toBe(false);
        expect(isModificationRequest(undefined)).toBe(false);
      });

      it('should treat ambiguous messages as questions (safer default)', () => {
        expect(isModificationRequest('the long run')).toBe(false);
        expect(isModificationRequest('week 3')).toBe(false);
        expect(isModificationRequest('Tuesday')).toBe(false);
      });

      it('should prioritize question pattern over modification if both present', () => {
        // "Can you change..." is a modification request despite starting with "can"
        expect(isModificationRequest('can you change this?')).toBe(true);
        // But "what changes..." is asking about changes, not requesting them
        expect(isModificationRequest('what changes did you make?')).toBe(false);
      });
    });
  });
});
