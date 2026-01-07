/**
 * Detect if a user message is requesting a plan modification or just asking a question
 *
 * This helps prevent the chatbot from immediately jumping to modify the plan
 * when the user is just asking questions about the existing plan.
 *
 * @param {string} message - User's message
 * @returns {boolean} - True if modification requested, false if just a question
 */
export const isModificationRequest = (message) => {
  if (!message || typeof message !== 'string') return false;

  const lowerMessage = message.toLowerCase().trim();

  // Question patterns - these indicate the user is asking, not requesting changes
  const questionPatterns = [
    /^(what|wie|was|how|warum|why|when|wann|where|wo|which|welche)/,
    /\?$/,  // Ends with question mark
    /how many/i,
    /how much/i,
    /can you (explain|tell|show)/i,
    /what (is|are|does|did)/i,
    /why (is|are|does|did)/i,
  ];

  // If it matches question patterns, it's likely NOT a modification request
  const isQuestion = questionPatterns.some(pattern => pattern.test(lowerMessage));

  // Modification request patterns - explicit requests to change something
  const modificationPatterns = [
    /^(change|änder|modify|update|adjust|anpassen|verschieb|move|replace|ersetze|add|hinzufüge|remove|entferne)/,
    /(can|could|would) you (change|modify|update|adjust|move|shift|add|remove)/i,
    /i (want|need|would like) to (change|modify|update|adjust|move|shift)/i,
    /make it (easier|harder|longer|shorter|more|less)/i,
    /switch|tausch/i,
    /instead of/i,
  ];

  const isModification = modificationPatterns.some(pattern => pattern.test(lowerMessage));

  // If it's clearly a question and not clearly a modification, treat as question
  if (isQuestion && !isModification) {
    return false;
  }

  // If it's clearly a modification request, return true
  if (isModification) {
    return true;
  }

  // Default: if ambiguous, treat as question (safer - don't modify plan unless explicit)
  return false;
};
