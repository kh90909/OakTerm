# OakTerm

_*** This is an early work-in-progress. Recommended for development and testing only. The usual disclaimers apply: may brick your Oak, mess with your Particle.io account, scare your cat, etc. ***_

OakTerm is a terminal app for the Digistump Oak that works in a similar fashion to the Arduino Serial Monitor, but data is sent wirelessly via the Particle Cloud rather than the serial port. In place of the `Serial.begin()`, `Serial.print()`, `Serial.read()`, etc. functions in your Arduino sketch, you use the equivalent `Particle.*` functions instead. 

To be able to send commands or data to an Oak, it will need to be running a sketch compiled using a version of OakCore not older than [this commit]( https://github.com/digistump/OakCore/commit/65146bb63e9aecae80573d4b042ba2e34c020410). Further, for the "user mode" button to switch from config back to user mode, the Oak needs to be running a config rom also compiled with a version of OakCore not older than that commit.

**Test it out here: http://rawgit.com/kh90909/OakTerm/master/index.html**
