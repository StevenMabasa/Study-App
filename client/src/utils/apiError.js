function parseRetryAfterSeconds(message) {
  const retryMatch = String(message || '').match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);

  if (!retryMatch) {
    return null;
  }

  const seconds = Math.ceil(Number(retryMatch[1]));
  return Number.isFinite(seconds) ? seconds : null;
}

export function formatApiError(error, fallbackMessage) {
  const rawMessage = String(
    error?.response?.data?.error ||
    error?.message ||
    fallbackMessage ||
    'Something went wrong.'
  ).trim();

  const lowerMessage = rawMessage.toLowerCase();
  const isQuotaError =
    lowerMessage.includes('quota exceeded') ||
    lowerMessage.includes('exceeded your current quota') ||
    lowerMessage.includes('rate limit') ||
    (lowerMessage.includes('429') && lowerMessage.includes('quota')) ||
    lowerMessage.includes('generaterequestsperdayperprojectpermodel') ||
    lowerMessage.includes('generate_content_free_tier_requests');

  if (isQuotaError) {
    const retryAfterSeconds = parseRetryAfterSeconds(rawMessage);
    const retryHint = retryAfterSeconds
      ? ` If the limit is temporary, try again in about ${retryAfterSeconds} seconds.`
      : '';

    return {
      variant: 'quota',
      message: `Gemini usage is temporarily unavailable for this app because the current quota has been reached. Please wait for the quota reset and try again later.${retryHint}`
    };
  }

  return {
    variant: 'error',
    message: rawMessage || fallbackMessage || 'Something went wrong.'
  };
}
