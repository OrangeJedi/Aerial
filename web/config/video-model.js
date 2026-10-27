export function visibleVideos(videos, sources, localize, query = '') {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return videos.flatMap((video, index) => {
        if (!sources(video).length) {
            return [];
        }
        const text = localize(video);
        const searchable = [text.name, text.accessibilityLabel, video.name, video.accessibilityLabel].filter(Boolean).join(' ').toLocaleLowerCase();
        return terms.every(term => searchable.includes(term)) ? [{video, index, text}] : [];
    });
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
