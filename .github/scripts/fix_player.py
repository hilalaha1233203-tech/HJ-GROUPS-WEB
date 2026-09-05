from pathlib import Path

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

# The hidden audio element must use the audio route.
s = s.replace(
    "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(currentEpisode.telegram_message_id)}` : (currentEpisode.src || undefined)}\n            preload=\"metadata\"",
    "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/audio/message/${encodeURIComponent(currentEpisode.telegram_message_id)}` : (currentEpisode.src || undefined)}\n            preload=\"metadata\"",
    1,
)

# The visible/fullscreen video player must use the video route and hide normal download controls.
s = s.replace(
    "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/audio/message/${currentEpisode.telegram_message_id}` : (currentEpisode.src || undefined)}\n                      controls\n                      autoPlay",
    "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(currentEpisode.telegram_message_id)}` : (currentEpisode.src || undefined)}\n                      controls\n                      controlsList=\"nodownload noplaybackrate\"\n                      disablePictureInPicture\n                      onContextMenu={(event) => event.preventDefault()}\n                      autoPlay",
    1,
)

# If the first pass added video-only controls to the audio element, remove them.
s = s.replace(
    "            controlsList=\"nodownload noplaybackrate\"\n            disablePictureInPicture\n            onContextMenu={(event) => event.preventDefault()}\n",
    "",
    1,
)

# Add a media error guard to both media elements exactly once per element.
audio_end = """            onEnded={\n              handleEnded\n            }\n          />"""
audio_new = """            onEnded={\n              handleEnded\n            }\n            onError={() => {\n              console.error('Media playback failed:', currentEpisode?.src)\n              setIsPlaying(false)\n            }}\n          />"""
if "Media playback failed:" not in s:
    s = s.replace(audio_end, audio_new, 1)

# Fullscreen video gets the same guard if it is not already present.
video_end = """                      onEnded={\n                        handleEnded\n                      }\n                    />"""
video_new = """                      onEnded={\n                        handleEnded\n                      }\n                      onError={() => {\n                        console.error('Media playback failed:', currentEpisode?.src)\n                        setIsPlaying(false)\n                      }}\n                    />"""
if s.count("Media playback failed:") < 2:
    s = s.replace(video_end, video_new, 1)

# Prevent accidental browser download/context actions on the fullscreen video.
if 'controlsList="nodownload noplaybackrate"' not in s:
    s = s.replace(
        "                      controls\n                      autoPlay",
        "                      controls\n                      controlsList=\"nodownload noplaybackrate\"\n                      disablePictureInPicture\n                      onContextMenu={(event) => event.preventDefault()}\n                      autoPlay",
        1,
    )

app.write_text(s, encoding='utf-8')
print('Player hardening patch completed.')