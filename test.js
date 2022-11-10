var SunCalc = require('suncalc');

// get today's sunlight times for London
var times = SunCalc.getTimes(new Date(), 40, -111);

// format sunrise time from the Date object

var sunriseStr = (times.sunrise.getHours() < 10 ? '0' : "") + times.sunrise.getHours() + ':' + (times.sunrise.getMinutes() < 10 ? '0': "") + times.sunrise.getMinutes();
var sunsetStr = (times.sunset.getHours() < 10 ? '0' : "") + times.sunset.getHours() + ':' + (times.sunset.getMinutes() < 10 ? '0': "") + times.sunset.getMinutes();


console.log(sunriseStr);
console.log(sunsetStr);