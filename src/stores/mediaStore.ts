import { create } from "zustand";
import { mediaApi, type MediaFile } from "../lib/pibApi";
import { rosBridgeClient, ROS_TOPICS } from "../lib/rosApi";
import { setMediaWebContent } from "../lib/tauriApi";

const MEDIA_API_UNAVAILABLE_MESSAGE =
  "Media file management is not available on this backend.";

function isMediaApiUnavailableError(error?: string): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes("entity not found") ||
    normalized.includes("http 404") ||
    normalized.includes("not found")
  );
}

function canRenderOnWebDisplay(source?: string): boolean {
  if (!source) return false;
  const trimmed = source.trim();
  return /^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed);
}

function normalizeMediaCommandName(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) return trimmed;

  const normalizedPath = trimmed.replace(/\\/g, "/");
  const lastSegment = normalizedPath.split("/").filter(Boolean).pop();
  return lastSegment || trimmed;
}

interface MediaState {
  faces: MediaFile[];
  audioFiles: MediaFile[];
  videoFiles: MediaFile[];
  mediaApiAvailable: boolean | null;
  activeFace: string | null;
  playingAudio: string | null;
  playingVideo: string | null;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;

  fetchFaces: () => Promise<void>;
  fetchAudioFiles: () => Promise<void>;
  fetchVideoFiles: () => Promise<void>;
  uploadFace: (file: File) => Promise<void>;
  uploadAudio: (file: File) => Promise<void>;
  uploadVideo: (file: File) => Promise<void>;
  deleteFace: (name: string) => Promise<void>;
  deleteAudio: (name: string) => Promise<void>;
  deleteVideo: (name: string) => Promise<void>;
  setFace: (name: string | null, sourceUrl?: string) => void;
  playAudio: (name: string, sourceUrl?: string) => void;
  stopAudio: () => void;
  playVideo: (name: string, sourceUrl?: string) => void;
  stopVideo: () => void;
  clearError: () => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  faces: [],
  audioFiles: [],
  videoFiles: [],
  mediaApiAvailable: null,
  activeFace: null,
  playingAudio: null,
  playingVideo: null,
  isUploading: false,
  uploadProgress: 0,
  error: null,

  fetchFaces: async () => {
    if (get().mediaApiAvailable === false) return;
    const result = await mediaApi.listFaces();
    if (result.success && result.data) {
      set({ faces: result.data.files, mediaApiAvailable: true, error: null });
    } else if (isMediaApiUnavailableError(result.error)) {
      set({
        mediaApiAvailable: false,
        faces: [],
        audioFiles: [],
        videoFiles: [],
        error: MEDIA_API_UNAVAILABLE_MESSAGE,
      });
    } else {
      set({ error: result.error || "Failed to fetch faces" });
    }
  },

  fetchAudioFiles: async () => {
    if (get().mediaApiAvailable === false) return;
    const result = await mediaApi.listAudio();
    if (result.success && result.data) {
      set({ audioFiles: result.data.files, mediaApiAvailable: true, error: null });
    } else if (isMediaApiUnavailableError(result.error)) {
      set({
        mediaApiAvailable: false,
        faces: [],
        audioFiles: [],
        videoFiles: [],
        error: MEDIA_API_UNAVAILABLE_MESSAGE,
      });
    } else {
      set({ error: result.error || "Failed to fetch audio files" });
    }
  },

  fetchVideoFiles: async () => {
    if (get().mediaApiAvailable === false) return;
    const result = await mediaApi.listVideos();
    if (result.success && result.data) {
      set({ videoFiles: result.data.files, mediaApiAvailable: true, error: null });
    } else if (isMediaApiUnavailableError(result.error)) {
      set({
        mediaApiAvailable: false,
        faces: [],
        audioFiles: [],
        videoFiles: [],
        error: MEDIA_API_UNAVAILABLE_MESSAGE,
      });
    } else {
      set({ error: result.error || "Failed to fetch video files" });
    }
  },

  uploadFace: async (file: File) => {
    if (get().mediaApiAvailable === false) {
      set({ error: MEDIA_API_UNAVAILABLE_MESSAGE });
      return;
    }
    set({ isUploading: true, uploadProgress: 0, error: null });
    const formData = new FormData();
    formData.append("file", file);
    const result = await mediaApi.uploadFace(formData, (p) =>
      set({ uploadProgress: p })
    );
    set({ isUploading: false, uploadProgress: 0 });
    if (result.success) {
      await get().fetchFaces();
    } else if (isMediaApiUnavailableError(result.error)) {
      set({
        mediaApiAvailable: false,
        faces: [],
        audioFiles: [],
        videoFiles: [],
        error: MEDIA_API_UNAVAILABLE_MESSAGE,
      });
    } else {
      set({ error: result.error || "Upload failed" });
    }
  },

  uploadAudio: async (file: File) => {
    if (get().mediaApiAvailable === false) {
      set({ error: MEDIA_API_UNAVAILABLE_MESSAGE });
      return;
    }
    set({ isUploading: true, uploadProgress: 0, error: null });
    const formData = new FormData();
    formData.append("file", file);
    const result = await mediaApi.uploadAudio(formData, (p) =>
      set({ uploadProgress: p })
    );
    set({ isUploading: false, uploadProgress: 0 });
    if (result.success) {
      await get().fetchAudioFiles();
    } else if (isMediaApiUnavailableError(result.error)) {
      set({
        mediaApiAvailable: false,
        faces: [],
        audioFiles: [],
        videoFiles: [],
        error: MEDIA_API_UNAVAILABLE_MESSAGE,
      });
    } else {
      set({ error: result.error || "Upload failed" });
    }
  },

  uploadVideo: async (file: File) => {
    if (get().mediaApiAvailable === false) {
      set({ error: MEDIA_API_UNAVAILABLE_MESSAGE });
      return;
    }
    set({ isUploading: true, uploadProgress: 0, error: null });
    const formData = new FormData();
    formData.append("file", file);
    const result = await mediaApi.uploadVideo(formData, (p) =>
      set({ uploadProgress: p })
    );
    set({ isUploading: false, uploadProgress: 0 });
    if (result.success) {
      await get().fetchVideoFiles();
    } else if (isMediaApiUnavailableError(result.error)) {
      set({
        mediaApiAvailable: false,
        faces: [],
        audioFiles: [],
        videoFiles: [],
        error: MEDIA_API_UNAVAILABLE_MESSAGE,
      });
    } else {
      set({ error: result.error || "Upload failed" });
    }
  },

  deleteFace: async (name: string) => {
    if (get().mediaApiAvailable === false) {
      set({ error: MEDIA_API_UNAVAILABLE_MESSAGE });
      return;
    }
    const result = await mediaApi.deleteFace(name);
    if (result.success) {
      set({ faces: get().faces.filter((f) => f.name !== name) });
      if (get().activeFace === name) set({ activeFace: null });
    } else if (isMediaApiUnavailableError(result.error)) {
      set({ mediaApiAvailable: false, error: MEDIA_API_UNAVAILABLE_MESSAGE });
    } else {
      set({ error: result.error || "Delete failed" });
    }
  },

  deleteAudio: async (name: string) => {
    if (get().mediaApiAvailable === false) {
      set({ error: MEDIA_API_UNAVAILABLE_MESSAGE });
      return;
    }
    const result = await mediaApi.deleteAudio(name);
    if (result.success) {
      set({ audioFiles: get().audioFiles.filter((f) => f.name !== name) });
      if (get().playingAudio === name) set({ playingAudio: null });
    } else if (isMediaApiUnavailableError(result.error)) {
      set({ mediaApiAvailable: false, error: MEDIA_API_UNAVAILABLE_MESSAGE });
    } else {
      set({ error: result.error || "Delete failed" });
    }
  },

  deleteVideo: async (name: string) => {
    if (get().mediaApiAvailable === false) {
      set({ error: MEDIA_API_UNAVAILABLE_MESSAGE });
      return;
    }
    const result = await mediaApi.deleteVideo(name);
    if (result.success) {
      set({ videoFiles: get().videoFiles.filter((f) => f.name !== name) });
      if (get().playingVideo === name) set({ playingVideo: null });
    } else if (isMediaApiUnavailableError(result.error)) {
      set({ mediaApiAvailable: false, error: MEDIA_API_UNAVAILABLE_MESSAGE });
    } else {
      set({ error: result.error || "Delete failed" });
    }
  },

  setFace: (name: string | null, sourceUrl?: string) => {
    const normalizedName = name ? normalizeMediaCommandName(name) : null;
    set({ activeFace: normalizedName });
    if (normalizedName) {
      rosBridgeClient.publish(
        ROS_TOPICS.DISPLAY_COMMAND,
        "std_msgs/String",
        { data: normalizedName }
      );

      if (canRenderOnWebDisplay(sourceUrl)) {
        void setMediaWebContent("image", sourceUrl!, `Face: ${normalizedName}`).catch(() => {
          // Ignore web display sync failures to keep local media controls responsive.
        });
      }
    }
  },

  playAudio: (name: string, sourceUrl?: string) => {
    const normalizedName = normalizeMediaCommandName(name);
    if (!normalizedName) return;

    set({ playingAudio: normalizedName });
    rosBridgeClient.publish(ROS_TOPICS.AUDIO_PLAY, "std_msgs/String", {
      data: normalizedName,
    });

    if (canRenderOnWebDisplay(sourceUrl)) {
      void setMediaWebContent("audio", sourceUrl!, `Audio: ${normalizedName}`).catch(() => {
        // Ignore web display sync failures to keep local media controls responsive.
      });
    }
  },

  stopAudio: () => {
    set({ playingAudio: null });
    rosBridgeClient.publish(ROS_TOPICS.AUDIO_STOP, "std_msgs/Empty", {});
    void setMediaWebContent("none", "", "Media Display").catch(() => {
      // Ignore web display sync failures to keep local media controls responsive.
    });
  },

  playVideo: (name: string, sourceUrl?: string) => {
    const normalizedName = normalizeMediaCommandName(name);
    if (!normalizedName) return;

    set({ playingVideo: normalizedName });
    rosBridgeClient.publish(ROS_TOPICS.VIDEO_PLAY, "std_msgs/String", {
      data: normalizedName,
    });

    if (canRenderOnWebDisplay(sourceUrl)) {
      void setMediaWebContent("video", sourceUrl!, `Video: ${normalizedName}`).catch(() => {
        // Ignore web display sync failures to keep local media controls responsive.
      });
    }
  },

  stopVideo: () => {
    set({ playingVideo: null });
    rosBridgeClient.publish(ROS_TOPICS.VIDEO_STOP, "std_msgs/Empty", {});
    void setMediaWebContent("none", "", "Media Display").catch(() => {
      // Ignore web display sync failures to keep local media controls responsive.
    });
  },

  clearError: () => set({ error: null }),
}));
