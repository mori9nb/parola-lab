# Evaluation plan (no model evaluated yet)

Create a reviewed, versioned Persian–Italian set covering meanings, synonyms, accepted alternate translations, articles/prepositions, reflexives and modal/infinitive structures. Hold out a test split before prompt tuning or fine-tuning.

Metrics: unique correct option, alternative-answer ambiguity, grammatical correctness, explanation correctness in Persian, level appropriateness, valid output schema, latency and provider consumption. Evaluate speech recognition separately from grammatical evaluation; users must be able to correct transcripts. Do not treat transcription-normalized speech as pronunciation evidence.

Keep model ID, provider, prompt version, dataset hash and evaluation script revision. Publish aggregate results only. Personal chats/recordings are excluded from training and benchmark export by default.
