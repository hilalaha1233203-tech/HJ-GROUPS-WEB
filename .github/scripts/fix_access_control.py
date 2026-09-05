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

# Pass the parent story ID into every episode access check.
for item_name, story_expr in [
    ('currentEpisode', 'currentStory?.id'),
    ('episode', 'story?.id'),
]:
    pattern = rf"canAccessContent\(\n(\s*){item_name},\n\s*adsKey\n\s*\)"
    replacement = rf"canAccessContent(\n\1{item_name},\n\1adsKey,\n\1{story_expr}\n\1)"
    s = re.sub(pattern, replacement, s, count=1)

# requestAccess also needs the parent story ID for already-purchased stories.
s = s.replace(
    "  const requestAccess = (\n    item,\n    adsKey,\n    onGranted\n  ) => {\n    if (canAccessContent(item, adsKey)) {",
    "  const requestAccess = (\n    item,\n    adsKey,\n    onGranted,\n    storyId\n  ) => {\n    if (canAccessContent(item, adsKey, storyId)) {",
    1,
)

s = s.replace(
    "      () => {\n        if (isReading) {",
    "      () => {\n        if (isReading) {",
    1,
)

# Add story IDs to the two requestAccess call sites.
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

app.write_text(s, encoding='utf-8')
print('Access-control hardening patch completed.')
