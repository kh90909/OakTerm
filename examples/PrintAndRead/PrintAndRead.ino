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
