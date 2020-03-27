# Contributing to Aerial

Aerial is open source under the [MIT License](LICENSE).

If you want to contribute code or other resources to Aerial, we would love the help!

For small changes or minor bug fixes just submit a Pull Request and I'll have a look.

For larger changes create an issue so we can fully discuss the change, coordinate efforts, and help you figure out the existing code.

## How to set up Aerial's dev environment

Aerial is an Electron app and is set up as such. 
If you have written Node.js before the set up is very similar.
To set up your environment you will need the following:

* Javascript IDE (any one will do)
* Node.JS (nvm is encouraged)

Simply clone or fork the repo. Open the repo in you IDE to start coding.

All code is written in HTML, CSS, and JavaScript. 
It should be pretty self-explanatory, but if you have any questions create an issue.

To test the app, first make sure you have all the node modules installed by running `npm install` in the project directory. Then run `npm start /s` to launch the screen saver

Because of the way Windows screen savers work Aerial will launch different windows based on the startup flag you give it.
A list of all the built in flags detailed below

| Flag | Window |
|:---:|:------:|
| /s | Launches the screen saver in full screen mode|
| /c | Launches the config menu|
| /t | Launches the screen saver in a smaller window with borders |
| /j | Super secret JSON editor | 

#### Building Aerial

Want to build Aerial for yourself? First set up dev environment as detailed above. 
Then run `npm run build-folder` to build the folder version or `npm run build-exe` to build the .exe file.
Rename the aerial.exe file to aerial.scr, then right click to install. 

## FAQ

>What do you need help with right now?

The app install process is a bit messy, I would love it if someone with more experience with windows apps and electron could help streamline the process

We are also looking for people to help clean up the UI/UX, add new feature (see the main page), and simply test Aerial.

>I don't know how to do any of that! What do I do?

We would still love your help! Create an issue with something you would like to see done and we can help you make it happen.

>I'm having an issue and I need help!

Create an issue and we'll get back to you ASAP.