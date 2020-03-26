<p align="center">  
    <img alt="" src="/documentation/images/surface_preview.gif" />
</p>

# Aerial - Apple TV Screen Saver for Windows
 
Aerial is a Windows screen saver that mimics the Apple TV screen saver that displays the videos Apple shot over New York, San Francisco, Hawaii, China, etc. as well as from the ISS and various underwater locations.

Aerial is inspired by [Mac Aerial Screen Saver](https://github.com/JohnCoates/Aerial) and [Aerial for Windows](https://github.com/cDima/Aerial).

Aerial is open source so feel free to contribute.

## Installing
>🚧 This project is still in beta. It might not always work or behave as expected. 🚧

Download the latest release from [here](https://github.com/OrangeJedi/Aerial/releases). Follow the instructions to install Aerial.

#### [Changelog](/documentation/changelog.md)

## Features
* Cycles through randomly selected Apple TV videos
* Easily select only the video you want to play
* Display a clock with the date and time
* Control video playback settings (speed, brightness, contrast, hue, saturation, etc.)
* Skip videos with the right arrow key
* Sync to the time of day (mostly - not all videos have a 'day' or 'night' attribute yet)
* Multi-Screen Support
    * Play a different video on each screen
    * Play the same video on each screen

## To-Do
* Full Multi-Screen Support
* Display text
  * Static text
  * Date and time
  * Display the location/description of the video
  * Sunrise & sunset
  * Custom image
  * Weather
  * Calendar and events?
 * Cache videos
* Import your own videos
* Video transitions
* 4K Videos
* Video preview in Window's screensaver settings
* Auto update video list

## Want to Contribute?

Check out our [guide to contributing](/documentation/contribute.md).

## About
This is a [Node.JS](https://nodejs.org)/[Electron](https://www.electronjs.org/) based implementation of [Mac Aerial Screen Saver](https://github.com/JohnCoates/Aerial) for Windows. I was using cDima's [Aerial for Windows](https://github.com/cDima/Aerial) on my computer but wished it had more of the features found in the MacOS version, as well as being less buggy and having better 4K support. Not knowing much about C# and with the project seemingly dead I researched Windows screensavers and found I could make a screen saver with Node.JS and Electron – both of which I am very familiar with. Hopefully I’ll be able build on this implementation and it get it to near where the MacOS version is.

## License
[MIT License](https://github.com/OrangeJedi/Aerial/blob/master/LICENSE)
