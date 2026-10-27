export function visibleVideos(videos, sources, localize) {
    return videos.flatMap((video, index) => sources(video).length ? [{video, index, text: localize(video)}] : []);
}

export function downloadChanges(id, mode, read) {
    const alwaysDownloadVideos = (read('alwaysDownloadVideos') || []).filter(value => value !== id);
    const neverDownloadVideos = (read('neverDownloadVideos') || []).filter(value => value !== id);
    if (mode === 'always') {
        alwaysDownloadVideos.push(id);
    } else if (mode === 'never') {
        neverDownloadVideos.push(id);
    }
    return {alwaysDownloadVideos, neverDownloadVideos};
}

export function loadProfileVideos(profile, current, builtInIds) {
    return [...new Set([...profile.videos.filter(id => builtInIds.has(id)), ...current.filter(id => !builtInIds.has(id))])];
}
