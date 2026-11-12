import CameraFeedMini from "../camera/CameraFeedMini";
import { useAIStore } from "../../stores/aiStore";

export default function VisionPreview() {
  const { visionEnabled, toggleVision } = useAIStore();

  if (!visionEnabled) return null;

  return (
    <div className="relative">
      <CameraFeedMini />
      <button
        onClick={toggleVision}
        className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white/60 hover:text-white"
        title="Disable vision"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
