import { useEffect, useRef } from "react";
import { useCameraStore } from "../../stores/cameraStore";

export default function CameraFeedMini() {
  const {
    isStreaming,
    streamUrl,
    frameData,
    streamMode,
    startStream,
    startRosBridgeStream,
  } = useCameraStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isStreaming) startStream();
  }, [isStreaming, startStream]);

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

  return (
    <div className="w-32 h-24 rounded-lg overflow-hidden border border-white/6 bg-black/40">
      {isStreaming && streamMode === "mjpeg" && streamUrl && (
        <img
          src={streamUrl}
          alt="Camera"
          className="w-full h-full object-cover"
          onError={() =>
            startRosBridgeStream(
              "MJPEG stream unavailable. Falling back to ROSBridge camera topic."
            )
          }
        />
      )}
      {isStreaming && streamMode === "rosbridge" && (
        <canvas ref={canvasRef} className="w-full h-full object-cover" />
      )}
      {!isStreaming && (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
          No feed
        </div>
      )}
    </div>
  );
}
