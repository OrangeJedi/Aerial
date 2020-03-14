# Aerial - Apple TV Screen Saver for Windows
 
Aerial is a Windows screen saver that mimics the Apple TV screen saver that displays the videos Apple shot over New York, San Francisco, Hawaii, China, etc. as well as from the ISS and various underwater locations.

Aerial is inspired by [Mac Aerial Screen Saver](https://github.com/JohnCoates/Aerial) and [Aerial for Windows](https://github.com/cDima/Aerial).

Aerial is open source so feel free to contribute.

## How to Install
>🚧This project is still in beta. It might not always work or behave as expected. Beware when using it. 🚧

Download the latest release from [here](https://github.com/OrangeJedi/Aerial/releases)

Extract the .zip file and navigate into the Aerial X.X.X folder

Right click on aerial.scr and click on the install option

Configure your screen saver settings in the pop up window

## Features
* Cycles through a random video 
* Shows a different video on each connected screen
* Choose which video to play
* Toggle a clock with the date and time on and off.

## To-Do
* Full Multi-Screen Support
* Display the location/description of the video
* Display user configured text
  * Static text
  * Date and time
  * Calendar and events?
* Import your own videos
* Cache videos
* Control display settings (brightness, contrast, hue, saturation, etc.)
* Sync to the time of day
* Video transitions
* 4K Videos
* Proper video preview in windows screen saver picker
* Auto update video list

## About
This is a [Node.JS](https://nodejs.org)/[Electron](https://www.electronjs.org/) based implementation of [Mac Aerial Screen Saver](https://github.com/JohnCoates/Aerial) for Windows. I was using cDima's [Aerial for Windows](https://github.com/cDima/Aerial) on my computer but wished it had more of the features found in the MacOS version, as well as being less buggy and having better 4K support. Not knowing much about C# and with the project seemingly dead I researched Windows screensavers and found I could make a screen saver with Node.JS and Electron – both of which I am very familiar with. Hopefully I’ll be able build on this implementation and it get it to near where the MacOS version is.

## License
[MIT License](https://github.com/OrangeJedi/Aerial/blob/master/LICENSE)
