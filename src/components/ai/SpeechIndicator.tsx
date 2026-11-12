export default function SpeechIndicator({
  isListening,
  isSpeaking,
}: {
  isListening: boolean;
  isSpeaking: boolean;
}) {
  if (!isListening && !isSpeaking) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] text-xs text-white/60">
      {isListening && (
        <>
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 bg-red-400 rounded-full animate-pulse"
                style={{
                  height: `${8 + Math.random() * 8}px`,
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </span>
          <span>Listening...</span>
        </>
      )}
      {isSpeaking && (
        <>
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 bg-blue-400 rounded-full animate-pulse"
                style={{
                  height: `${8 + Math.random() * 8}px`,
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </span>
          <span>Speaking...</span>
        </>
      )}
    </div>
  );
}
