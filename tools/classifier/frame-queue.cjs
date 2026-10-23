function createFrameQueue(load, concurrency = 3) {
    const jobs = new Map();
    const waiting = [];
    let active = 0;
    let stopped = false;

    function pump() {
        while (!stopped && active < concurrency && waiting.length) {
            const job = waiting.shift();
            job.started = true;
            active++;
            Promise.resolve().then(() => load(job.id)).then(job.resolve, job.reject).finally(() => {
                jobs.delete(job.id);
                active--;
                pump();
            });
        }
    }

    function request(id, background = false) {
        if (stopped) {
            return Promise.reject(new Error('Classifier is closing'));
        }
        let job = jobs.get(id);
        if (!job) {
            job = {id, started: false};
            job.promise = new Promise((resolve, reject) => {
                job.resolve = resolve;
                job.reject = reject;
            });
            jobs.set(id, job);
            waiting.push(job);
        }
        if (!background && !job.started) {
            waiting.splice(waiting.indexOf(job), 1);
            waiting.unshift(job);
        }
        pump();
        return job.promise;
    }

    function stop() {
        stopped = true;
        for (const job of waiting.splice(0)) {
            jobs.delete(job.id);
            job.reject(new Error('Classifier is closing'));
        }
    }

    return {request, stop};
}

module.exports = {createFrameQueue};
