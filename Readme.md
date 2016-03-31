# OakTerm

_*** This is an early work-in-progress. Recommended for development and testing only. The usual disclaimers apply: may brick your Oak, mess with your Particle.io account, scare your cat, etc. ***_

You'll need to use [my fork of OakCore](https://github.com/kh90909/OakCore/tree/cloud-serial-fixes) to compile your Arduino sketch as it fixes some bugs in the cloud serial implementation.

### Not yet implemented
* Send event
* Set variable
* Call function
* Upload file
* Settings
* Sending to specific device id (right now, commands and data go to all of the online Oaks that are associated with your Particle.io account)
* Error handling (in the meantime, open the developer tools - F12 in Chrome/Firefox - to see errors)
* A tidy layout
* Mobile browser compatibility

**Test it out here: https://rawgit.com/kh90909/OakTerm/master/index.html**

After logging in, your Particle.io access token will be cached in your browser's localstorage so that you don't have to re-enter your email and password each time. Click the logout button to clear the token.