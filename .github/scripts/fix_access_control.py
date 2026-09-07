from pathlib import Path
import re

app = Path('src/App.jsx')
s = app.read_text(encoding='utf-8')

old = """  const canAccessContent = (\n    item,\n    adsKey\n  ) =>\n    canAccess(item, {\n      isAdmin,\n      unlockedAds,\n      adsKey,\n      purchasedStoryIds,\n    })"""
new = """  const canAccessContent = (\n    item,\n    adsKey,\n    storyId\n  ) =>\n    canAccess(item, {\n      isAdmin,\n      unlockedAds,\n      adsKey,\n      purchasedStoryIds,\n      storyId,\n    })"""
if old in s:
    s = s.replace(old, new, 1)

s = s.replace(
    "  const loadAndPlay =\n    (episode) => {",
    "  const loadAndPlay =\n    (episode, story = currentStory) => {",
    1,
)

s = s.replace(
    "          currentStory\n            ? adsKeyFor(\n              episode.type ===",
    "          story\n            ? adsKeyFor(\n              episode.type ===",
    1,
)

s = s.replace(
    "          story\n            ? adsKeyFor(\n              episode.type ===\n                'video'\n                ? 'video-episode'\n                : 'episode',\n              currentStory.id,\n              episode.number",
    "          story\n            ? adsKeyFor(\n              episode.type ===\n                'video'\n                ? 'video-episode'\n                : 'episode',\n              story.id,\n              episode.number",
    1,
)

pattern = r"canAccessContent\(\n(\s*)currentEpisode,\n\s*adsKey\n\s*\)"
replacement = r"canAccessContent(\n\1currentEpisode,\n\1adsKey,\n\1currentStory?.id\n\1)"
s = re.sub(pattern, replacement, s, count=1)

s = s.replace(
    "  const requestAccess = (\n    item,\n    adsKey,\n    onGranted\n  ) => {\n    if (canAccessContent(item, adsKey)) {",
    "  const requestAccess = (\n    item,\n    adsKey,\n    onGranted,\n    storyId\n  ) => {\n    if (canAccessContent(item, adsKey, storyId)) {",
    1,
)

s = s.replace(
    "        loadAndPlay(\n          episode,\n          story\n        )\n      }\n    )\n  }",
    "        loadAndPlay(\n          episode,\n          story\n        )\n      },\n      story.id\n    )\n  }",
    1,
)

s = s.replace(
    "          loadAndPlay(\n            episode\n          )\n        }\n      )\n    }",
    "          loadAndPlay(\n            episode,\n            currentStory\n          )\n        },\n        currentStory.id\n      )\n    }",
    1,
)

# Context-safe parent-story IDs for each rendered episode collection.
s = re.sub(
    r"(adsKeyFor\(\s*'episode',\s*selectedStory\.id,[\s\S]*?canAccessContent\(\s*episode,\s*adsKey,\s*)[^\n]+",
    r"\1selectedStory.id",
    s,
    count=1,
)
s = re.sub(
    r"(adsKeyFor\(\s*'video-episode',\s*selectedVideo\.id,[\s\S]*?canAccessContent\(\s*episode,\s*adsKey,\s*)[^\n]+",
    r"\1selectedVideo.id",
    s,
    count=1,
)
s = re.sub(
    r"(currentStory\.id,\s*episode\.number\s*\)\s*const accessible\s*=\s*canAccessContent\(\s*episode,\s*adsKey,\s*)[^\n]+",
    r"\1currentStory.id",
    s,
    count=1,
)

app.write_text(s, encoding='utf-8')
print('Access-control hardening patch completed.')
