// ai/ai.contract.js
// Bridge module: exposes the AI contract to the app as window.LC_AI_CONTRACT.

import {
  getAiContractV1,
  buildAiSystemPromptV1,
  buildAiUserPromptV1,
  sanitizeModelTextToJson,
  parseContractAnswerJson,
  validateContractAnswers,
  buildRepairPromptV1
} from './core/ai.contract.js';

export {
  getAiContractV1,
  buildAiSystemPromptV1,
  buildAiUserPromptV1,
  sanitizeModelTextToJson,
  parseContractAnswerJson,
  validateContractAnswers,
  buildRepairPromptV1
};

// Expose on window for legacy/non-importing code.
try{
  if (!window.LC_AI_CONTRACT){
    window.LC_AI_CONTRACT = {
      getAiContractV1,
      buildAiSystemPromptV1,
      buildAiUserPromptV1,
      sanitizeModelTextToJson,
      parseContractAnswerJson,
      validateContractAnswers,
      buildRepairPromptV1
    };
  }
}catch(e){ /* ignore */ }
