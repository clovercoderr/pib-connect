interface MicrophoneButtonProps {
  isListening: boolean;
  onToggle: () => void;
  className?: string;
}

export default function MicrophoneButton({
  isListening,
  onToggle,
  className = "",
}: MicrophoneButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`relative p-2 rounded-lg transition-colors ${
        isListening
          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70"
      } ${className}`}
      title={isListening ? "Stop listening" : "Start listening"}
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
      </svg>
      {isListening && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
    </button>
  );
}
