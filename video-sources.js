function getVideoSources(video, settings) {
    if (video.path) {
        return [video.path];
    }
    const allowH265 = settings.get('allowH265') !== false;
    const allow4K = settings.get('allow4K') !== false;
    const prefer4K240 = allowH265 && allow4K && settings.get('prefer4K240') === true;
    const qualities = ['H2641080p'];
    if (allowH265) {
        qualities.push('H2651080p');
        if (allow4K) {
            qualities.push('H2654k', 'H2654k240');
        }
    }
    if (prefer4K240) {
        qualities.reverse();
    }
    return qualities.map(quality => video.src[quality]).filter(Boolean);
}

module.exports = {getVideoSources};
