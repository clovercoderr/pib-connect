import { useEffect, useRef } from "react";
import { useCameraStore } from "../../stores/cameraStore";
import { rosBridgeClient } from "../../lib/rosApi";

export default function CameraFeed({ className = "" }: { className?: string }) {
  const {
    isStreaming,
    streamUrl,
    frameData,
    streamMode,
    error,
    startStream,
    stopStream,
    startRosBridgeStream,
  } = useCameraStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw ROSBridge frames to canvas
  useEffect(() => {
    if (streamMode !== "rosbridge" || !frameData || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
    };
    img.src = frameData;
  }, [frameData, streamMode]);

  const rosConnected = rosBridgeClient.isConnected();

  const handleRetry = () => {
    stopStream();
    // Small delay to ensure cleanup
    setTimeout(() => {
      if (streamMode === "rosbridge") {
        startRosBridgeStream();
      } else {
        startStream();
      }
    }, 200);
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
            Camera Feed
          </span>
          {isStreaming && (
            <span className="text-[10px] text-white/30">
              ({streamMode === "rosbridge" ? "ROSBridge" : "MJPEG"})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Stream mode toggle */}
          {!isStreaming && (
            <button
              onClick={() => startRosBridgeStream()}
              className="px-2 py-0.5 text-[10px] rounded bg-white/[0.06] text-white/40 hover:bg-white/[0.1] hover:text-white/60"
              title="Start via ROSBridge"
            >
              ROS
            </button>
          )}
          <button
            onClick={isStreaming ? stopStream : startStream}
            className={`px-2 py-0.5 text-xs rounded ${
              isStreaming
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            }`}
          >
            {isStreaming ? "Stop" : "Start"}
          </button>
        </div>
      </div>

      <div className="relative w-full aspect-video bg-black/40 rounded-lg overflow-hidden border border-white/6">
        {!isStreaming && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30 text-sm">
            <span>Camera off</span>
            <span className="text-[10px] text-white/20">
              ROSBridge: {rosConnected ? "connected" : "disconnected"}
            </span>
          </div>
        )}

        {isStreaming && streamMode === "mjpeg" && streamUrl && (
          <img
            src={streamUrl}
            alt="Camera feed"
            className="w-full h-full object-contain"
            onError={() =>
              startRosBridgeStream(
                "MJPEG stream unavailable. Falling back to ROSBridge camera topic."
              )
            }
          />
        )}

        {isStreaming && streamMode === "rosbridge" && (
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
        )}

        {error && (
          <div className="absolute bottom-0 inset-x-0 bg-red-500/80 text-white text-xs px-2 py-1.5 flex items-center gap-2">
            <span className="flex-1">{error}</span>
            <button
              onClick={handleRetry}
              className="shrink-0 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[10px] font-medium"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
