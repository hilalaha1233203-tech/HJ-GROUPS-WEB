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

# Parent story is required for purchased-story access because normalized
# episode objects intentionally don't carry their parent story id.
for item_name, story_expr in [
    ('currentEpisode', 'currentStory?.id'),
    ('episode', 'story?.id'),
]:
    pattern = rf"canAccessContent\(\n(\s*){item_name},\n\s*adsKey\n\s*\)"
    replacement = rf"canAccessContent(\n\1{item_name},\n\1adsKey,\n\1{story_expr}\n\1)"
    s = re.sub(pattern, replacement, s, count=1)

s = s.replace(
    "        loadAndPlay(\n          episode\n        )",
    "        loadAndPlay(\n          episode,\n          story\n        )",
    1,
)

app.write_text(s, encoding='utf-8')
print('Access-control hardening patch completed.')
