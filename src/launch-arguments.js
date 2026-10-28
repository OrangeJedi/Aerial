function normalizeLaunchArguments(argv) {
    return argv.flatMap(argument => {
        const match = /^\/(c|s|p|t|j|w|u|nq|dt)(?::(.*))?$/i.exec(argument);
        if (!match) {
            return [argument];
        }
        const flag = '/' + match[1].toLowerCase();
        return match[2] === undefined || match[2] === '' ? [flag] : [flag, match[2]];
    });
}

module.exports = {normalizeLaunchArguments};
