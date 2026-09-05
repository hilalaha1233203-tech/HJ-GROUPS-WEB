from pathlib import Path
import re

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

AUDIO_SRC = "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/audio/message/${encodeURIComponent(currentEpisode.telegram_message_id)}` : (currentEpisode.src || undefined)}"
VIDEO_SRC = "src={currentEpisode.telegram_message_id ? `${STREAMING_SERVER_URL}/video/message/${encodeURIComponent(currentEpisode.telegram_message_id)}` : (currentEpisode.src || undefined)}"

# Normalize every <video> source independently. This is intentionally scoped
# to the video element so a later patch can never turn audio playback into a
# video route (or vice versa).
video_pattern = re.compile(r"(<video\b[\s\S]*?\bsrc=)(\{currentEpisode\.telegram_message_id \? `\$\{STREAMING_SERVER_URL\}/(?:audio|video)/message/\$\{encodeURIComponent\(currentEpisode\.telegram_message_id\)\}` : \(currentEpisode\.src \|\| undefined\)\})([\s\S]*?</video>)")
s = video_pattern.sub(lambda m: m.group(1) + VIDEO_SRC[len('src='):] + m.group(3), s)

# Normalize the hidden audio element without touching video tags.
audio_pattern = re.compile(r"(<audio\b[\s\S]*?\bsrc=)(\{currentEpisode\.telegram_message_id \? `\$\{STREAMING_SERVER_URL\}/(?:audio|video)/message/\$\{encodeURIComponent\(currentEpisode\.telegram_message_id\)\}` : \(currentEpisode\.src \|\| undefined\)\})([\s\S]*?</audio>)")
s = audio_pattern.sub(lambda m: m.group(1) + AUDIO_SRC[len('src='):] + m.group(3), s)

# Add download/PiP suppression to every native video controls block exactly
# where it belongs. The custom player remains playback-only.
def harden_video(match):
    tag = match.group(0)
    if 'controlsList="nodownload noplaybackrate"' not in tag:
        tag = tag.replace('controls\n', 'controls\n                      controlsList="nodownload noplaybackrate"\n', 1)
    if 'disablePictureInPicture' not in tag:
        tag = tag.replace('controlsList="nodownload noplaybackrate"\n', 'controlsList="nodownload noplaybackrate"\n                      disablePictureInPicture\n', 1)
    if 'onContextMenu={(event) => event.preventDefault()}' not in tag:
        marker = 'disablePictureInPicture\n'
        tag = tag.replace(marker, marker + '                      onContextMenu={(event) => event.preventDefault()}\n', 1)
    return tag

s = re.sub(r"<video\b[\s\S]*?</video>", harden_video, s)

# Ensure each media element has a playback error guard.
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
