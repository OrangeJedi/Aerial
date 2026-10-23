const $ = id => document.getElementById(id);
let videos = [];
let queue = [];
let index = 0;
let generation = 0;
let saving = false;
let ready = false;
const choices = [...document.querySelectorAll('[data-tag]')];
const preloaded = new Map();

function preloadFrames() {
    for (const id of queue.slice(index + 1, index + 7)) {
        if (preloaded.has(id)) {
            continue;
        }
        const promise = classifier.frame(id, true).then(url => {
            const image = new Image();
            image.src = url;
            return image;
        }).catch(() => {
            // A background failure must not interrupt classification; viewing retries it.
            preloaded.delete(id);
        });
        preloaded.set(id, promise);
    }
}

function controls() {
    for (const button of choices) {
        button.disabled = saving || !ready;
        button.setAttribute('aria-pressed', String(videos.find(video => video.id === queue[index])?.timeOfDay === button.dataset.tag));
    }
    $('previous').disabled = saving || index <= 0;
    $('next').disabled = saving || index >= queue.length - 1;
    $('filter').disabled = saving;
    $('retry').disabled = saving || !queue[index];
}

async function show(message = '') {
    const token = ++generation;
    ready = false;
    $('frame').hidden = true;
    const video = videos.find(item => item.id === queue[index]);
    const tagged = videos.filter(item => ['day', 'night', 'twilight'].includes(item.timeOfDay)).length;
    $('progress').textContent = `${tagged} / ${videos.length} tagged · ${videos.length - tagged} remaining`;
    $('status').textContent = message;
    $('loading').hidden = false;
    controls();
    if (!video) {
        $('title').textContent = 'All done';
        $('details').textContent = 'Your choices are saved. Select All videos to review tags.';
        $('loading').textContent = 'No videos left in this queue';
        return;
    }
    $('title').textContent = `${video.accessibilityLabel || ''} — ${video.name || video.id}`;
    $('details').textContent = `${index + 1} / ${queue.length} in this queue · ${video.timeOfDay || 'Untagged'} · ${video.id}`;
    $('loading').textContent = 'Extracting first frame…';
    try {
        const frame = classifier.frame(video.id);
        preloadFrames();
        const url = await frame;
        if (token !== generation) {
            return;
        }
        $('frame').onload = () => {
            if (token !== generation) {
                return;
            }
            $('frame').hidden = false;
            $('loading').hidden = true;
            ready = true;
            controls();
        };
        $('frame').onerror = () => {
            $('loading').textContent = 'Unable to display frame. Reload or skip this video.';
        };
        $('frame').src = url;
    } catch (error) {
        if (token === generation) {
            $('loading').textContent = 'Unable to load first frame';
            $('status').textContent = error.message;
        }
    }
}

async function choose(tag) {
    if (!ready || saving || !queue[index]) {
        return;
    }
    saving = true;
    controls();
    try {
        videos = await classifier.save(queue[index], tag);
        index++;
        saving = false;
        await show(`Saved ${tag}.`);
    } catch (error) {
        saving = false;
        $('status').textContent = `Save failed: ${error.message}`;
        controls();
    }
}

for (const button of choices) {
    button.addEventListener('click', () => choose(button.dataset.tag));
}
$('previous').onclick = () => { index--; show(); };
$('next').onclick = () => { index++; show(); };
$('retry').onclick = () => show();
$('filter').onchange = () => {
    queue = videos.filter(video => $('filter').value === 'all' || !['day', 'night', 'twilight'].includes(video.timeOfDay)).map(video => video.id);
    index = 0;
    show();
};
document.addEventListener('keydown', event => {
    if (event.target.tagName === 'SELECT' || event.repeat || saving) {
        return;
    }
    const tag = {'1': 'day', '2': 'night', '3': 'twilight'}[event.key];
    if (tag) {
        event.preventDefault();
        choose(tag);
    } else if (event.key === 'ArrowLeft' && !$('previous').disabled) {
        $('previous').click();
    } else if (event.key === 'ArrowRight' && !$('next').disabled) {
        $('next').click();
    }
});
classifier.list().then(data => {
    videos = data;
    $('filter').onchange();
}).catch(error => { $('status').textContent = `Cannot read videos.json: ${error.message}`; });
