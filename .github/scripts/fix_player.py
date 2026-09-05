from pathlib import Path
import re

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

AUDIO_SRC = "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/audio/message/${encodeURIComponent(currentEpisode.telegram_message_id)}` : (currentEpisode.src || undefined)}"
VIDEO_SRC = "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(currentEpisode.telegram_message_id)}` : (currentEpisode.src || undefined)}"

# JSX media elements are self-closing. Scope route normalization to each tag
# so audio can never accidentally receive the video endpoint.
def normalize_video(match):
    tag = match.group(0)
    tag = re.sub(
        r"src=\{currentEpisode\.telegram_message_id \? `\$\{STREAMING_SERVER_URL\}/(?:audio|video)/message/\$\{encodeURIComponent\(currentEpisode\.telegram_message_id\)\}` : \(currentEpisode\.src \|\| undefined\)\}",
        VIDEO_SRC,
        tag,
        count=1,
    )
    if 'controls' in tag and 'controlsList="nodownload noplaybackrate"' not in tag:
        tag = tag.replace('controls\n', 'controls\n                      controlsList="nodownload noplaybackrate"\n', 1)
    if 'controlsList="nodownload noplaybackrate"' in tag and 'disablePictureInPicture' not in tag:
        tag = tag.replace('controlsList="nodownload noplaybackrate"\n', 'controlsList="nodownload noplaybackrate"\n                      disablePictureInPicture\n', 1)
    if 'disablePictureInPicture' in tag and 'onContextMenu={(event) => event.preventDefault()}' not in tag:
        tag = tag.replace('disablePictureInPicture\n', 'disablePictureInPicture\n                      onContextMenu={(event) => event.preventDefault()}\n', 1)
    return tag

s = re.sub(r"<video\b[\s\S]*?\/>", normalize_video, s)

# Normalize the hidden audio element independently.
def normalize_audio(match):
    tag = match.group(0)
    tag = re.sub(
        r"src=\{currentEpisode\.telegram_message_id \? `\$\{STREAMING_SERVER_URL\}/(?:audio|video)/message/\$\{encodeURIComponent\(currentEpisode\.telegram_message_id\)\}` : \(currentEpisode\.src \|\| undefined\)\}",
        AUDIO_SRC,
        tag,
        count=1,
    )
    return tag

s = re.sub(r"<audio\b[\s\S]*?\/>", normalize_audio, s)

# Ensure both media elements have a playback error guard.
if s.count("Media playback failed:") < 2:
    video_end = """                      onEnded={\n                        handleEnded\n                      }\n                    />"""
    video_new = """                      onEnded={\n                        handleEnded\n                      }\n                      onError={() => {\n                        console.error('Media playback failed:', currentEpisode?.src)\n                        setIsPlaying(false)\n                      }}\n                    />"""
    s = s.replace(video_end, video_new, 1)

if "Media playback failed:" not in s:
    audio_end = """            onEnded={\n              handleEnded\n            }\n          />"""
    audio_new = """            onEnded={\n              handleEnded\n            }\n            onError={() => {\n              console.error('Media playback failed:', currentEpisode?.src)\n              setIsPlaying(false)\n            }}\n          />"""
    s = s.replace(audio_end, audio_new, 1)

app.write_text(s, encoding='utf-8')
print('Player hardening patch completed.')
