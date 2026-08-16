// RogerVIB v0.3 Brah response-quality patch
// Keeps the trained neural classifier, but makes the layer after classification
// respond like it understood the intent instead of picking vaguely-related junk.

MODEL_INFO.brah = 'RogerVIB v0.3 Brah — trained intent brain with less stupid responses.';

// Tighten response pools. These are intentionally small: if the model correctly
// understands the intent, the answer should actually fit that intent.
BRAH_RESPONSES.status = [
  'good. just here VIBing',
  'pretty good',
  'just here VIBing'
];

BRAH_RESPONSES.greeting = ['sup', 'yo', 'hello'];
BRAH_RESPONSES.laughter = ['lmao', 'bruh', 'thats wild'];
BRAH_RESPONSES.insult = ['correct', 'cursed but functional'];
BRAH_RESPONSES.thanks = ['np', 'okay', '👍'];
BRAH_RESPONSES.unknown_question = [
  'idk. you may have to explain what you mean',
  'i do not know enough about that yet',
  'google it and pretend i knew it before'
];

const BRAH_UNKNOWN_STATEMENTS = [
  'okay',
  'lmao',
  'i have no idea what you want me to do with that'
];

function brahLooksLikeUrl(input) {
  return /^(https?:\/\/|www\.)\S+$/i.test(input.trim());
}

// Save the trained version so this patch can preserve all neural inference.
const trainedBrahReply = getBrahReply;

getBrahReply = function(input) {
  const trimmed = input.trim();
  const n = normalize(trimmed);

  // A raw URL is not a normal sentence and should not be shoved through the
  // language-intent classifier as if it were one.
  if (brahLooksLikeUrl(trimmed)) {
    if (/youtu(?:\.be|be\.com)/i.test(trimmed)) {
      return 'youtube link detected. i cant actually watch it yet';
    }
    return 'thats a link. i cant open links yet';
  }

  // These ultra-common phrasings are also useful sanity checks around the
  // trained classifier. The network still handles paraphrases; these just make
  // the obvious forms deterministic instead of randomly choosing a weird reply.
  if (/^(hows it going|how is it going|how are you|how you doing|howre you|whats up|wassup)\??$/.test(n)) {
    return brahPick(BRAH_RESPONSES.status);
  }

  if (/^(hi|hello|hey|yo|sup)\b/.test(n) && n.split(' ').length <= 3) {
    return brahPick(BRAH_RESPONSES.greeting);
  }

  // Run the genuinely trained model for everything else.
  const prediction = brahPredict(trimmed);

  // The old fallback was too willing to respond with random junk. Be much more
  // conservative when the classifier itself is unsure.
  if (!prediction.intent || prediction.confidence < 0.62) {
    const question = /\?$/.test(trimmed) || /^(what|why|how|who|where|when|is|are|can|could|would|should|do|does|did)\b/i.test(trimmed);
    return brahPick(question ? BRAH_RESPONSES.unknown_question : BRAH_UNKNOWN_STATEMENTS);
  }

  // For confident predictions, reuse the trained implementation now that its
  // response pools have been cleaned up.
  return trainedBrahReply(trimmed);
};
