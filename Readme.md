# OakTerm

OakTerm is a terminal app for the Digistump Oak that works in a similar fashion to the Arduino Serial Monitor, but data is sent wirelessly via the Particle Cloud rather than the serial port. In place of the `Serial.begin()`, `Serial.print()`, `Serial.read()`, etc. functions in your Arduino sketch, you use the equivalent `Particle.*` functions instead. 

For example, this example sketch will echo back any data sent to it via OakTerm:

```C++
char receive_buffer[255]; // Buffer to store received data

void setup() {
  // Initialize cloud serial
  Particle.begin();

  Particle.println("Hello world!");
  Particle.println("Send me data and I will echo it back.");
}

void loop() {
  // Check if there is any data available to be read
  int avail=Particle.available();

  // Our receive buffer is only 255 bytes long, so limit
  // the number of bytes read to 254, to leave room for
  // a null terminator so that Particle.print() knows
  // where to stop printing
  if(avail>254)
    avail=254;

  // If there is data available
  if(avail>0) {
    // Read it into the buffer
    Particle.readBytes(receive_buffer,avail);

    // Add the null terminator
    receive_buffer[avail]=0;

    // Print it back to OakTerm
    Particle.print("You just sent: ");
    Particle.print(receive_buffer);
  }
}
```

See the [examples directory](examples/) for a full set of examples, demonstrating how to send and receive data and events to and from your Oak, view variable values, and call functions.

To be able to send commands or data to an Oak, it will need to be running a sketch compiled using a version of OakCore not older than [this commit]( https://github.com/digistump/OakCore/commit/65146bb63e9aecae80573d4b042ba2e34c020410). Further, for the "user mode" button to switch from config back to user mode, the Oak needs to be running a config rom also compiled with a version of OakCore not older than that commit.

**Test it out here: http://rawgit.com/kh90909/OakTerm/master/index.html**
